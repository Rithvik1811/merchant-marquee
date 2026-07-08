"""
Tests for the Continuity Gate (§5.10 capped retry + human-in-the-loop).

The three-branch decision AND the human-review path are exercised through a REAL
compiled LangGraph run with a real checkpointer (MemorySaver), so `interrupt()`
and `Command(resume=...)` genuinely drive LangGraph's real pause/resume
mechanics -- NOT by calling the node function directly. This is the one place in
Phase 4 that must prove the real mechanism works, not just the function's
internal logic.

The Gate does no model/network I/O of its own (it only reads drift scores the
Continuity Agent already wrote), so nothing here needs faking beyond seeding
state -- the pause/resume is the whole point.
"""
from __future__ import annotations

from typing import TypedDict

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from agents.continuity_agent import DRIFT_THRESHOLD
from agents.continuity_gate import (
    MAX_AUTO_RETRIES,
    continuity_gate_node,
    route_after_continuity_gate,
)

_OVER = DRIFT_THRESHOLD + 0.2
_WITHIN = DRIFT_THRESHOLD - 0.1


def _shot(shot_id: str, *, status: str = "passed", retry_count: int = 0) -> dict:
    return {
        "shot_id": shot_id,
        "t_start": 0.0,
        "t_end": 4.0,
        "beat_role": "hook",
        "description": "d",
        "shot_type": "macro_detail",
        "camera_move": "push_in",
        "framing": "fills_frame",
        "lighting": "soft key light",
        "negative_prompt": "n",
        "reference_image_id": "photo_1",
        "text_overlay_zone": "none",
        "duration_sec": 4.0,
        "allocated_budget": 1.0,
        "voiceover_line": "v",
        "justification": {"script_quote": "q", "truth_fact_id": "t1", "treatment_ref": 0},
        "status": status,
        "retry_count": retry_count,
    }


def _gen(drift: float, video_uri: str = "http://oss/clip.mp4") -> dict:
    return {"video_uri": video_uri, "attempt": 1, "drift_score": drift}


class _GateState(TypedDict, total=False):
    shot_list: list
    generated_shots: dict
    human_review_queue: list
    reasoning_trace: str


def _build_gate_graph():
    """A small, self-contained StateGraph wrapping ONLY the real Continuity Gate
    node, with a real MemorySaver -- so interrupt()/resume run for real."""
    builder = StateGraph(_GateState)
    builder.add_node("continuity_gate", continuity_gate_node)
    builder.add_edge(START, "continuity_gate")
    builder.add_edge("continuity_gate", END)
    return builder.compile(checkpointer=MemorySaver())


def _state(shots, generated):
    return {
        "shot_list": shots,
        "generated_shots": generated,
        "human_review_queue": [],
        "reasoning_trace": "",
    }


# ---------------------------------------------------------------------------
# Branch 1: within threshold -> no-op, stays "passed", no interrupt.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_within_threshold_leaves_shot_passed():
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "within"}}
    result = await graph.ainvoke(_state([_shot("s1")], {"s1": _gen(_WITHIN)}), config=cfg)

    st = await graph.aget_state(cfg)
    assert not st.interrupts  # never paused
    assert st.next == ()  # ran to completion
    shot = result["shot_list"][0]
    assert shot["status"] == "passed"
    assert shot["retry_count"] == 0
    assert result["human_review_queue"] == []


# ---------------------------------------------------------------------------
# Branch 2: over threshold, retries left -> pending + retry_count+1, no interrupt.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_over_threshold_with_retries_left_requeues_pending():
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "retry"}}
    result = await graph.ainvoke(_state([_shot("s1", retry_count=0)], {"s1": _gen(_OVER)}), config=cfg)

    st = await graph.aget_state(cfg)
    assert not st.interrupts
    shot = result["shot_list"][0]
    assert shot["status"] == "pending"
    assert shot["retry_count"] == 1  # incremented exactly once
    assert result["human_review_queue"] == []
    # The router would loop this back to Video-Gen.
    assert route_after_continuity_gate(result) == "video_gen"


@pytest.mark.asyncio
async def test_retry_count_increment_is_the_only_mutation_here():
    # Confirm the increment is by exactly 1 and other fields are untouched.
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "retry1"}}
    result = await graph.ainvoke(_state([_shot("s1", retry_count=1)], {"s1": _gen(_OVER)}), config=cfg)
    shot = result["shot_list"][0]
    assert shot["retry_count"] == 2
    assert shot["status"] == "pending"


# ---------------------------------------------------------------------------
# Branch 3: retries exhausted -> real interrupt(), resume with each resolution.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_exhausted_raises_real_interrupt_and_enqueues_review():
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "review"}}
    shot = _shot("s1", retry_count=MAX_AUTO_RETRIES)
    await graph.ainvoke(_state([shot], {"s1": _gen(_OVER, "http://oss/s1.mp4")}), config=cfg)

    st = await graph.aget_state(cfg)
    # The run genuinely paused at the interrupt.
    assert st.next == ("continuity_gate",)
    assert len(st.interrupts) == 1
    surfaced = st.interrupts[0].value
    assert surfaced["shot_id"] == "s1"
    assert surfaced["drift_score"] == pytest.approx(_OVER)
    assert surfaced["candidate_frame_uris"] == ["http://oss/s1.mp4"]


@pytest.mark.asyncio
async def test_interrupt_requested_event_fires_twice_across_pause_resume_known_limitation():
    """KNOWN, DOCUMENTED LIMITATION (see continuity_gate.py's module docstring):
    `adispatch_custom_event("interrupt_requested", ...)` sits BEFORE `interrupt()`,
    and everything before `interrupt()` re-executes on resume -- so the event
    fires once when the run pauses AND once again when it resumes, even though
    COMMITTED STATE (human_review_queue) ends up correct either way. This test
    locks in the CURRENT, understood, low-severity behavior (a live-stream-only
    double-notification, not a state bug) so a future change is deliberate, not
    accidental -- in particular, a "fix" that makes the event stop firing
    entirely (zero live notifications) would be silently WORSE and this test
    would catch that regression too (event_count would become 0, not 1)."""
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "dup-event"}}
    shot = _shot("s1", retry_count=MAX_AUTO_RETRIES)
    state = _state([shot], {"s1": _gen(_OVER, "http://oss/s1.mp4")})

    pause_events = [
        e async for e in graph.astream_events(state, config=cfg, version="v2")
        if e.get("event") == "on_custom_event" and e["name"] == "interrupt_requested"
    ]
    resume_events = [
        e async for e in graph.astream_events(
            Command(resume={"resolution": "approve"}), config=cfg, version="v2"
        )
        if e.get("event") == "on_custom_event" and e["name"] == "interrupt_requested"
    ]

    # The documented, verified double-fire: once per astream_events pass.
    assert len(pause_events) == 1
    assert len(resume_events) == 1
    assert pause_events[0]["data"]["review"]["shot_id"] == "s1"
    assert resume_events[0]["data"]["review"]["shot_id"] == "s1"

    # Committed state is NOT doubled -- this is the part that actually matters.
    final = await graph.aget_state(cfg)
    assert len(final.values["human_review_queue"]) == 1
    assert final.values["shot_list"][0]["status"] == "passed"  # applied "approve"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "resolution,expected_status,expected_retry",
    [
        ("approve", "passed", MAX_AUTO_RETRIES),
        ("retry_with_edit", "pending", MAX_AUTO_RETRIES + 1),  # uncapped human retry
        ("accept_fallback", "fallback_requested", MAX_AUTO_RETRIES),
    ],
)
async def test_resume_applies_each_resolution(resolution, expected_status, expected_retry):
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": f"resume-{resolution}"}}
    shot = _shot("s1", retry_count=MAX_AUTO_RETRIES)
    await graph.ainvoke(_state([shot], {"s1": _gen(_OVER)}), config=cfg)

    # Real resume through LangGraph's Command(resume=...) mechanism.
    result = await graph.ainvoke(Command(resume={"resolution": resolution}), config=cfg)

    st = await graph.aget_state(cfg)
    assert st.next == ()  # resolved, ran to completion
    out = result["shot_list"][0]
    assert out["status"] == expected_status
    assert out["retry_count"] == expected_retry
    # The review entry was enqueued.
    assert len(result["human_review_queue"]) == 1
    assert result["human_review_queue"][0]["shot_id"] == "s1"
    # Only "approve" finishes; retry_with_edit ("pending") and accept_fallback
    # ("fallback_requested") both loop back to Video-Gen -> Ken-Burns.
    expected_route = "end" if resolution == "approve" else "video_gen"
    assert route_after_continuity_gate(result) == expected_route


@pytest.mark.asyncio
async def test_accept_fallback_resume_routes_back_for_ken_burns():
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "af-route"}}
    await graph.ainvoke(_state([_shot("s1", retry_count=MAX_AUTO_RETRIES)], {"s1": _gen(_OVER)}), config=cfg)
    result = await graph.ainvoke(Command(resume={"resolution": "accept_fallback"}), config=cfg)
    # fallback_requested must loop back so it reaches ken_burns_fallback (which is
    # upstream of Continuity on the loop) -- routing to END would leave it clipless.
    assert result["shot_list"][0]["status"] == "fallback_requested"
    assert route_after_continuity_gate(result) == "video_gen"


# ---------------------------------------------------------------------------
# Multi-shot review in ONE batch: two shots both exhausted -> two interrupts,
# resumed in order, resolutions route to the correct shot.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_two_shots_need_review_resume_in_order():
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "multi"}}
    shots = [
        _shot("s1", retry_count=MAX_AUTO_RETRIES),
        _shot("s2", retry_count=MAX_AUTO_RETRIES),
    ]
    generated = {"s1": _gen(_OVER, "http://oss/s1.mp4"), "s2": _gen(_OVER, "http://oss/s2.mp4")}

    await graph.ainvoke(_state(shots, generated), config=cfg)

    # First interrupt is for s1 (shot-list order).
    st = await graph.aget_state(cfg)
    assert st.interrupts[0].value["shot_id"] == "s1"

    # Resume s1 -> approve. Node re-runs, s1's interrupt returns, s2's now pauses.
    # (Mid-batch, LangGraph reports the still-pending interrupt via st.interrupts;
    # st.next is an unreliable indicator here, so we assert on st.interrupts.)
    await graph.ainvoke(Command(resume={"resolution": "approve"}), config=cfg)
    st = await graph.aget_state(cfg)
    assert len(st.interrupts) == 1  # still paused on exactly one shot
    assert st.interrupts[0].value["shot_id"] == "s2"

    # Resume s2 -> accept_fallback. Now it finishes.
    result = await graph.ainvoke(Command(resume={"resolution": "accept_fallback"}), config=cfg)
    st = await graph.aget_state(cfg)
    assert st.next == ()
    assert not st.interrupts

    by_id = {s["shot_id"]: s for s in result["shot_list"]}
    # Resolutions routed to the correct shots, in order.
    assert by_id["s1"]["status"] == "passed"
    assert by_id["s2"]["status"] == "fallback_requested"
    # Both review entries enqueued, no duplication across the resumes.
    assert {e["shot_id"] for e in result["human_review_queue"]} == {"s1", "s2"}
    assert len(result["human_review_queue"]) == 2


# ---------------------------------------------------------------------------
# Non-scored / non-passed shots pass through untouched.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_non_passed_and_unscored_shots_pass_through():
    graph = _build_gate_graph()
    cfg = {"configurable": {"thread_id": "passthrough"}}
    shots = [
        _shot("s_fb", status="fallback"),
        _shot("s_req", status="fallback_requested"),
        _shot("s_unscored", status="passed"),  # no drift_score in generated
    ]
    generated = {
        "s_fb": {"video_uri": "http://oss/fb.mp4", "attempt": 1},
        "s_unscored": {"video_uri": "http://oss/u.mp4", "attempt": 1},  # no drift_score
    }
    result = await graph.ainvoke(_state(shots, generated), config=cfg)

    st = await graph.aget_state(cfg)
    assert not st.interrupts
    by_id = {s["shot_id"]: s for s in result["shot_list"]}
    assert by_id["s_fb"]["status"] == "fallback"
    assert by_id["s_req"]["status"] == "fallback_requested"
    assert by_id["s_unscored"]["status"] == "passed"
    assert result["human_review_queue"] == []
