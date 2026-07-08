"""
Unit tests for the Continuity Agent (§5.10 Qwen-VL drift scoring).

Both boundaries are faked (same injection pattern every other agent uses):
  * the Qwen-VL client -> tests._fakes.FakeOpenAIClient seeded with a JSON
    drift-score response (the ffmpeg-extracted frame is base64-inlined for the
    real vision message shape, but the fake client ignores content).
  * the ffmpeg frame extractor -> a tiny fake that writes a couple of bytes to a
    temp .jpg and returns its path (no real ffmpeg -- matches how
    tests/_phase3_graph.py fakes Ken-Burns's render step).

Covers: scores only "passed" shots; skips "fallback"/"fallback_requested";
skips already-scored clips; one shot's Qwen-VL failure doesn't block others and
does NOT write a passing score for it; drift_scored events fire correctly.
"""
from __future__ import annotations

import os
import tempfile

import pytest
from langchain_core.runnables import RunnableLambda

from agents.continuity_agent import (
    DRIFT_THRESHOLD,
    continuity_agent_node,
    score_continuity,
)
from tests._fakes import FakeOpenAIClient, _FakeStream

PRODUCT_PHOTOS = ["http://example.com/photo1.jpg", "http://example.com/photo2.jpg"]


def _shot(shot_id: str, *, status: str = "passed", retry_count: int = 0, reference_image_id: str = "photo_1") -> dict:
    return {
        "shot_id": shot_id,
        "t_start": 0.0,
        "t_end": 4.0,
        "beat_role": "hook",
        "description": "The seam catches the morning light.",
        "shot_type": "macro_detail",
        "camera_move": "push_in",
        "framing": "fills_frame",
        "lighting": "soft key light, neutral background, clean commercial look",
        "negative_prompt": "warped label, distorted logo",
        "reference_image_id": reference_image_id,
        "text_overlay_zone": "none",
        "duration_sec": 4.0,
        "allocated_budget": 1.0,
        "voiceover_line": "line",
        "justification": {"script_quote": "q", "truth_fact_id": "t1", "treatment_ref": 0},
        "status": status,
        "retry_count": retry_count,
    }


def _gen(video_uri: str = "http://oss.example.com/clip.mp4", **extra) -> dict:
    return {"video_uri": video_uri, "attempt": 1, "duration_sec_used": 4.0, "resolution_used": "1080P", **extra}


def _fake_extract_frame(video_uri: str, duration_sec: float) -> str:
    """Stand-in for the ffmpeg boundary: write a tiny real file, return its path."""
    fd, path = tempfile.mkstemp(suffix=".jpg", prefix="continuity_test_")
    os.close(fd)
    with open(path, "wb") as fh:
        fh.write(b"\xff\xd8\xff\xe0fake-jpeg")
    return path


def _drift_json(score: float, justification: str = "matches well") -> str:
    return f'{{"drift_score": {score}, "justification": "{justification}"}}'


# ---------------------------------------------------------------------------
# score_continuity -- status filtering
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scores_only_passed_shots_skips_fallback_and_requested():
    shots = [
        _shot("s_passed", status="passed"),
        _shot("s_fallback", status="fallback"),
        _shot("s_requested", status="fallback_requested"),
        _shot("s_pending", status="pending"),
    ]
    generated = {
        "s_passed": _gen(),
        "s_fallback": _gen(),
        "s_requested": _gen(),
        "s_pending": _gen(),
    }
    client = FakeOpenAIClient([_drift_json(0.1)])

    updated, records = await score_continuity(
        shots, generated, PRODUCT_PHOTOS, client=client, extract_frame_fn=_fake_extract_frame
    )

    # Only the "passed" shot was scored.
    assert set(updated.keys()) == {"s_passed"}
    assert {r["shot_id"] for r in records} == {"s_passed"}
    assert updated["s_passed"]["drift_score"] == pytest.approx(0.1)
    # Exactly one Qwen-VL call was made (only for the passed shot).
    assert client.call_count == 1


@pytest.mark.asyncio
async def test_skips_already_scored_clips():
    shots = [_shot("s1", status="passed")]
    generated = {"s1": _gen(drift_score=0.2)}  # already carries a score
    client = FakeOpenAIClient([_drift_json(0.9)])

    updated, records = await score_continuity(
        shots, generated, PRODUCT_PHOTOS, client=client, extract_frame_fn=_fake_extract_frame
    )

    assert updated == {}
    assert records == []
    assert client.call_count == 0  # no vision call for an already-scored clip


@pytest.mark.asyncio
async def test_passed_shot_without_generated_entry_is_skipped():
    shots = [_shot("s1", status="passed")]
    client = FakeOpenAIClient([_drift_json(0.1)])

    updated, records = await score_continuity(
        shots, {}, PRODUCT_PHOTOS, client=client, extract_frame_fn=_fake_extract_frame
    )

    assert updated == {}
    assert records == []
    assert client.call_count == 0


# ---------------------------------------------------------------------------
# score_continuity -- pass/fail derivation and the "attempt" field
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_pass_and_fail_derived_from_threshold():
    within = DRIFT_THRESHOLD - 0.1
    over = DRIFT_THRESHOLD + 0.1
    shots = [_shot("s_good", retry_count=0), _shot("s_bad", retry_count=1)]
    generated = {"s_good": _gen(), "s_bad": _gen()}
    # FakeOpenAIClient returns responses in order across calls.
    client = FakeOpenAIClient([_drift_json(within), _drift_json(over)])

    updated, records = await score_continuity(
        shots, generated, PRODUCT_PHOTOS, client=client, extract_frame_fn=_fake_extract_frame
    )

    by_id = {r["shot_id"]: r for r in records}
    assert by_id["s_good"]["passed"] is True
    assert by_id["s_good"]["attempt"] == 0
    assert by_id["s_bad"]["passed"] is False
    assert by_id["s_bad"]["attempt"] == 1  # mirrors retry_count
    assert updated["s_good"]["drift_score"] == pytest.approx(within)
    assert updated["s_bad"]["drift_score"] == pytest.approx(over)


# ---------------------------------------------------------------------------
# Failure isolation (conservative worst-case, batch not blocked)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_one_qwen_failure_does_not_block_others_and_writes_no_passing_score():
    shots = [_shot("s_boom"), _shot("s_ok")]
    generated = {"s_boom": _gen(), "s_ok": _gen()}

    class _BoomThenOkClient:
        """First scored shot's vision call raises; the second succeeds."""

        def __init__(self):
            self.call_count = 0
            self.chat = self
            self.completions = self

        async def create(self, model, messages, stream=False, **_kw):
            self.call_count += 1
            if self.call_count == 1:
                raise RuntimeError("simulated Qwen-VL network error")
            return _FakeStream(_drift_json(0.05))

        async def close(self):
            pass

    client = _BoomThenOkClient()
    updated, records = await score_continuity(
        shots, generated, PRODUCT_PHOTOS, client=client, extract_frame_fn=_fake_extract_frame
    )

    by_id = {r["shot_id"]: r for r in records}
    # Both shots produced a record (batch not blocked).
    assert set(by_id.keys()) == {"s_boom", "s_ok"}
    # The failed shot got the worst-case score -> NOT a passing score.
    assert updated["s_boom"]["drift_score"] == 1.0
    assert by_id["s_boom"]["passed"] is False
    # The other shot scored normally.
    assert by_id["s_ok"]["passed"] is True
    assert updated["s_ok"]["drift_score"] == pytest.approx(0.05)


# ---------------------------------------------------------------------------
# Node wrapper: merges into generated_shots + emits drift_scored events
# ---------------------------------------------------------------------------
def _state(shots, generated):
    return {
        "job_id": "job-cty",
        "product_photos": PRODUCT_PHOTOS,
        "shot_list": shots,
        "generated_shots": generated,
        "reasoning_trace": "",
    }


@pytest.mark.asyncio
async def test_node_writes_drift_scores_and_preserves_other_entries(monkeypatch):
    monkeypatch.setattr("agents.continuity_agent.extract_midpoint_frame", _fake_extract_frame)
    monkeypatch.setattr(
        "agents.continuity_agent.AsyncOpenAI",
        lambda *a, **k: FakeOpenAIClient([_drift_json(0.15)]),
    )

    shots = [_shot("s1", status="passed"), _shot("s2", status="fallback")]
    generated = {"s1": _gen("http://oss/s1.mp4"), "s2": _gen("http://oss/s2.mp4")}

    result = await RunnableLambda(continuity_agent_node).ainvoke(_state(shots, generated))

    gen = result["generated_shots"]
    # s1 scored; s2 (fallback) left exactly as it was, still present.
    assert gen["s1"]["drift_score"] == pytest.approx(0.15)
    assert "drift_score" not in gen["s2"]
    assert gen["s2"]["video_uri"] == "http://oss/s2.mp4"
    assert "[continuity_agent]" in result["reasoning_trace"]


@pytest.mark.asyncio
async def test_node_emits_drift_scored_events(monkeypatch):
    monkeypatch.setattr("agents.continuity_agent.extract_midpoint_frame", _fake_extract_frame)
    over = DRIFT_THRESHOLD + 0.2
    monkeypatch.setattr(
        "agents.continuity_agent.AsyncOpenAI",
        lambda *a, **k: FakeOpenAIClient([_drift_json(over)]),
    )

    shots = [_shot("s1", status="passed", retry_count=1)]
    generated = {"s1": _gen()}

    events = [
        e
        async for e in RunnableLambda(continuity_agent_node).astream_events(
            _state(shots, generated), version="v2"
        )
        if e.get("event") == "on_custom_event" and e.get("name") == "drift_scored"
    ]

    assert len(events) == 1
    data = events[0]["data"]
    assert data["shot_id"] == "s1"
    assert data["drift_score"] == pytest.approx(over)
    assert data["threshold"] == pytest.approx(DRIFT_THRESHOLD)
    assert data["passed"] is False
    assert data["attempt"] == 1
