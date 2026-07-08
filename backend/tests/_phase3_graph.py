"""
Shared fakes for Phase 3 graph tests (Video-Gen + Ken-Burns Fallback).

Every graph test that runs past the Budget Gate should monkeypatch these
boundaries so no real DashScope/Wan/ffmpeg/OSS calls are made.
"""
from __future__ import annotations

import os
import tempfile
from typing import Callable

from agents.video_gen_node import VideoGenAPIError


def make_fake_wan_generate(*, fail_if_prompt_contains: str | None = None) -> Callable:
    """Return an async generate_fn that succeeds unless the prompt matches."""

    async def _fake(**kwargs):
        prompt = kwargs.get("prompt", "")
        if fail_if_prompt_contains and fail_if_prompt_contains in prompt:
            raise VideoGenAPIError(f"simulated failure for prompt containing {fail_if_prompt_contains!r}")
        image_url = kwargs.get("image_url", "clip")
        leaf = image_url.rsplit("/", 1)[-1].split("?", 1)[0]
        return f"http://oss.example.com/wan/{leaf}.mp4"

    return _fake


def patch_phase3_boundaries(monkeypatch, *, fail_shot_s2: bool = False) -> None:
    """Monkeypatch Video-Gen Wan calls + OSS persist + Ken-Burns render/upload."""
    fail_marker = "asymmetric rear vent" if fail_shot_s2 else None
    monkeypatch.setattr(
        "agents.video_gen_node._call_wan_video_gen",
        make_fake_wan_generate(fail_if_prompt_contains=fail_marker),
    )

    def _fake_persist(remote_url, job_id, shot_id, filename="shot.mp4", *, bucket=None, download_fn=None):
        return f"http://oss.example.com/jobs/{job_id}/shots/{shot_id}/{filename}"

    monkeypatch.setattr("agents.video_gen_node.persist_remote_video_to_oss", _fake_persist)

    def _fake_render(shot, product_photos):
        fd, path = tempfile.mkstemp(suffix=".mp4", prefix="kenburns_test_")
        os.close(fd)
        with open(path, "wb") as fh:
            fh.write(b"fake-kenburns-mp4")
        return path

    monkeypatch.setattr("agents.ken_burns_fallback_node.render_ken_burns_clip", _fake_render)

    def _fake_upload(local_path, job_id, shot_id, filename="fallback_kenburns.mp4", *, bucket=None):
        return f"http://oss.example.com/jobs/{job_id}/shots/{shot_id}/{filename}"

    monkeypatch.setattr("agents.ken_burns_fallback_node.upload_video_to_oss", _fake_upload)


def patch_continuity_boundaries(monkeypatch, *, drift_score: float = 0.0) -> None:
    """Fake the Continuity Agent's per-shot scoring unit (§5.10 -- ffmpeg frame
    extraction + the Qwen-VL call), so a full-graph test can run through the
    Continuity Agent/Gate without real network or ffmpeg.

    Defaults to a clean, within-threshold `drift_score` so every scored shot
    passes, the Continuity Gate leaves them all "passed", and the retry loop ends
    immediately with no interrupt -- i.e. the full pipeline reaches END exactly as
    it did before Phase 4 wired Continuity in. Tests that want to exercise the
    retry/interrupt path fake `_score_one_shot` themselves (see
    tests/test_continuity_loop_e2e.py)."""

    async def _fake_score_one_shot(shot, entry, product_photos, client, extract):  # noqa: ARG001
        return drift_score, "clean match (test fake)"

    monkeypatch.setattr("agents.continuity_agent._score_one_shot", _fake_score_one_shot)
