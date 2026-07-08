"""
Full retry-loop integration tests (Phase 4 exit criteria, §5.10).

These drive the ENTIRE compiled LangGraph (graph/build.py), faking every network
boundary, to prove the Continuity retry CYCLE works as a real graph topology --
not just the nodes in isolation:

  Scenario A -- a shot drifts on the first pass, is AUTOMATICALLY retried once,
    the drift resolves, and the shot ends "passed" with retry_count incremented
    exactly once and a FRESH generated_shots entry from the re-generation.

  Scenario B -- a shot drifts and never resolves, EXHAUSTS its automatic retries,
    raises a REAL interrupt(), and a resume with "accept_fallback" routes it back
    through the (real, already-built) Ken-Burns Fallback Node to a final
    "fallback" status.

Upstream LLM boundaries are faked exactly as tests/test_graph_end_to_end.py does
(shared canned payloads from tests/test_graph_build.py). The Phase 3 boundaries
(Wan / OSS / Ken-Burns render+upload) are faked via tests/_phase3_graph.py, with
a COUNTING Wan fake layered on so we can assert re-generation actually happened.
The per-shot Continuity scoring unit (`_score_one_shot`, i.e. ffmpeg frame
extraction + the Qwen-VL call) is faked deterministically by shot_id/retry_count
-- the real vision+ffmpeg path is already covered by test_continuity_agent.py;
here the point is the LOOP, so a deterministic drift oracle keeps the topology
assertions crisp.
"""
from __future__ import annotations

import pytest
from langgraph.types import Command

from agents.continuity_agent import DRIFT_THRESHOLD
from graph.build import build_graph
from tests._fakes import make_content_routed_sync_openai, make_fake_async_openai
from tests._phase3_graph import patch_phase3_boundaries
from tests.test_graph_build import (
    CHECKER_ROUTES,
    CONCEPT_AGENT_PAYLOAD,
    HOOK_PAYLOAD,
    SHOT_LIST_CALL_A_PAYLOAD,
    SHOT_LIST_CALL_B_PAYLOAD,
    TREATMENT_PAYLOAD,
    TRUTH_EXTRACTOR_PAYLOAD,
)

_SEEDED_CAP = 1.00  # same feasible cap as test_graph_end_to_end.py
_DRIFTY_SHOT = "s2"
_OVER = DRIFT_THRESHOLD + 0.3
_WITHIN = DRIFT_THRESHOLD - 0.2


def _patch_upstream(monkeypatch):
    """Fake every upstream LLM boundary (identical to test_graph_end_to_end.py)."""
    monkeypatch.setattr("agents.product_truth_extractor.AsyncOpenAI", make_fake_async_openai([TRUTH_EXTRACTOR_PAYLOAD]))
    monkeypatch.setattr("agents.concept_agent.AsyncOpenAI", make_fake_async_openai([CONCEPT_AGENT_PAYLOAD]))
    monkeypatch.setattr("agents.hook_checker.AsyncOpenAI", make_fake_async_openai([HOOK_PAYLOAD]))
    monkeypatch.setattr("agents.critic_llm.OpenAI", make_content_routed_sync_openai(CHECKER_ROUTES))
    monkeypatch.setattr("agents.treatment_agent.AsyncOpenAI", make_fake_async_openai([TREATMENT_PAYLOAD]))
    monkeypatch.setattr(
        "agents.shot_list_agent.AsyncOpenAI",
        make_fake_async_openai([SHOT_LIST_CALL_A_PAYLOAD, SHOT_LIST_CALL_B_PAYLOAD]),
    )


def _patch_counting_wan(monkeypatch) -> dict:
    """Layer a per-shot COUNTING Wan fake so we can assert re-generation happened.

    Returns a mutable dict mapping reference-photo leaf -> call count. Each call
    returns a URL tagged with its attempt number so a re-generated clip is
    distinguishable from the original.
    """
    counts: dict[str, int] = {}

    async def _counting_wan(*, image_url, prompt, negative_prompt, duration_sec, resolution):
        leaf = image_url.rsplit("/", 1)[-1].split("?", 1)[0]
        counts[leaf] = counts.get(leaf, 0) + 1
        return f"http://wan.example.com/{leaf}/attempt{counts[leaf]}.mp4"

    monkeypatch.setattr("agents.video_gen_node._call_wan_video_gen", _counting_wan)
    return counts


def _patch_continuity_scoring(monkeypatch, *, always_drift: bool):
    """Fake the per-shot scoring unit deterministically by shot_id/retry_count.

    `always_drift=False` -> the drifty shot drifts only until it has been retried
    once (models "the retry fixed it"); `always_drift=True` -> it drifts forever
    (models "retries can't fix it" -> exhaustion -> human review).
    """
    async def _fake_score_one_shot(shot, entry, product_photos, client, extract):
        if shot["shot_id"] == _DRIFTY_SHOT and (always_drift or shot.get("retry_count", 0) < 1):
            return _OVER, "product identity drifted"
        return _WITHIN, "clean match"

    monkeypatch.setattr("agents.continuity_agent._score_one_shot", _fake_score_one_shot)


def _initial_state(job_id: str) -> dict:
    return {
        "job_id": job_id,
        "product_photos": ["http://example.com/a.jpg"],
        "brief": "a durable everyday case",
        "budget_ledger": {"cap": _SEEDED_CAP, "spent": 0.0, "per_shot": {}},
    }


# ---------------------------------------------------------------------------
# Scenario A: automatic retry resolves the drift.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_drifted_shot_auto_retried_once_then_passes(monkeypatch):
    _patch_upstream(monkeypatch)
    patch_phase3_boundaries(monkeypatch, fail_shot_s2=False)
    wan_counts = _patch_counting_wan(monkeypatch)
    _patch_continuity_scoring(monkeypatch, always_drift=False)

    graph = await build_graph()
    cfg = {"configurable": {"thread_id": "loop-auto-retry"}}
    custom_events = [
        e
        async for e in graph.astream_events(_initial_state("loop-auto-retry"), config=cfg, version="v2")
        if e.get("event") == "on_custom_event"
    ]

    values = (await graph.aget_state(cfg)).values
    by_id = {s["shot_id"]: s for s in values["shot_list"]}
    generated = values["generated_shots"]

    # The drifty shot was retried exactly once and now passes.
    assert by_id[_DRIFTY_SHOT]["status"] == "passed"
    assert by_id[_DRIFTY_SHOT]["retry_count"] == 1
    # Its non-drifty siblings never retried.
    for sid, shot in by_id.items():
        if sid != _DRIFTY_SHOT:
            assert shot["retry_count"] == 0
            assert shot["status"] == "passed"

    # Its final drift_score is within threshold now (the re-generation resolved it).
    assert generated[_DRIFTY_SHOT]["drift_score"] <= DRIFT_THRESHOLD
    # Wan was hit once per shot on pass 1 plus exactly one re-generation for the
    # drifty shot -- proving the loop re-ran Video-Gen for ONLY the retried shot.
    assert sum(wan_counts.values()) == len(by_id) + 1  # 3 shots + 1 re-gen

    # No human review was needed; no interrupt fired.
    assert values.get("human_review_queue", []) == []
    assert not (await graph.aget_state(cfg)).interrupts
    # drift_scored fired for the retried shot on BOTH passes (over, then within).
    drift_events = [e for e in custom_events if e["name"] == "drift_scored"]
    drifty_events = [e for e in drift_events if e["data"]["shot_id"] == _DRIFTY_SHOT]
    assert [e["data"]["passed"] for e in drifty_events] == [False, True]


# ---------------------------------------------------------------------------
# Scenario B: retries exhausted -> real interrupt -> accept_fallback -> Ken-Burns.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_exhausted_retries_interrupt_then_accept_fallback_routes_to_ken_burns(monkeypatch):
    _patch_upstream(monkeypatch)
    patch_phase3_boundaries(monkeypatch, fail_shot_s2=False)
    _patch_counting_wan(monkeypatch)
    _patch_continuity_scoring(monkeypatch, always_drift=True)

    graph = await build_graph()
    cfg = {"configurable": {"thread_id": "loop-exhaust"}}

    # Drive until the graph pauses at the real interrupt for the drifty shot.
    async for _ in graph.astream_events(_initial_state("loop-exhaust"), config=cfg, version="v2"):
        pass

    st = await graph.aget_state(cfg)
    assert len(st.interrupts) == 1
    surfaced = st.interrupts[0].value
    assert surfaced["shot_id"] == _DRIFTY_SHOT
    assert surfaced["drift_score"] > DRIFT_THRESHOLD

    # The drifty shot exhausted its automatic retries before the interrupt.
    paused_by_id = {s["shot_id"]: s for s in st.values["shot_list"]}
    assert paused_by_id[_DRIFTY_SHOT]["retry_count"] == 2

    # Resume with accept_fallback -> routes back through Ken-Burns to "fallback".
    async for _ in graph.astream_events(
        Command(resume={"resolution": "accept_fallback"}), config=cfg, version="v2"
    ):
        pass

    final = await graph.aget_state(cfg)
    assert not final.interrupts  # fully resolved
    assert final.next == ()
    by_id = {s["shot_id"]: s for s in final.values["shot_list"]}
    # The drifty shot got a REAL Ken-Burns fallback clip and terminal status.
    assert by_id[_DRIFTY_SHOT]["status"] == "fallback"
    generated = final.values["generated_shots"]
    assert _DRIFTY_SHOT in generated
    assert generated[_DRIFTY_SHOT]["video_uri"].startswith("http://oss.example.com/jobs/loop-exhaust/shots/s2/")
    # The review entry was recorded in the queue.
    queue = final.values["human_review_queue"]
    assert any(e["shot_id"] == _DRIFTY_SHOT for e in queue)
    # Siblings are untouched, still real passes.
    for sid, shot in by_id.items():
        if sid != _DRIFTY_SHOT:
            assert shot["status"] == "passed"
            assert shot["retry_count"] == 0
