"""
Tests for format_export_node — covers:
  1. format_export_node: missing/empty master_cut_uri → returns {}
  2. format_export_node: writes 'exports' key with 3 format keys (mocked)
  3. generate_format_exports: mocked ffmpeg/OSS → all 3 formats produced
  4. format_export_node: exception in generate_format_exports → re-raises
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from agents.format_export_node import (
    format_export_node,
    generate_format_exports,
)


# ---------------------------------------------------------------------------
# 1. format_export_node: missing/empty master_cut_uri → returns {}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_format_export_node_no_master_cut_uri_returns_empty():
    result = await format_export_node({"job_id": "j1"})
    assert result == {}


@pytest.mark.asyncio
async def test_format_export_node_empty_master_cut_uri_returns_empty():
    result = await format_export_node({"job_id": "j1", "master_cut_uri": ""})
    assert result == {}


# ---------------------------------------------------------------------------
# 6. format_export_node: writes 'exports' with 3 format keys (mocked inner call)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_format_export_node_writes_exports_key(monkeypatch):
    fake_exports = {
        "aspect_9x16": "https://oss.example/jobs/j1/exports/9x16.mp4",
        "aspect_1x1":  "https://oss.example/jobs/j1/exports/1x1.mp4",
        "aspect_16x9": "https://oss.example/jobs/j1/exports/16x9.mp4",
    }

    async def _fake_generate(master_cut_uri, job_id, **kw):
        return fake_exports

    async def _noop_dispatch(event_name, payload):
        pass

    monkeypatch.setattr("agents.format_export_node.generate_format_exports", _fake_generate)
    monkeypatch.setattr("agents.format_export_node.adispatch_custom_event", _noop_dispatch)

    state = {"job_id": "j1", "master_cut_uri": "https://oss.example/jobs/j1/master_cut.mp4"}
    result = await format_export_node(state)

    assert "exports" in result
    exports = result["exports"]
    assert set(exports.keys()) == {"aspect_9x16", "aspect_1x1", "aspect_16x9"}
    assert exports["aspect_9x16"] == "https://oss.example/jobs/j1/exports/9x16.mp4"


# ---------------------------------------------------------------------------
# 7. generate_format_exports: mocked ffmpeg/OSS → all 3 formats produced
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_format_exports_mocked_ffmpeg(tmp_path):
    fake_local = str(tmp_path / "master.mp4")
    with open(fake_local, "wb") as f:
        f.write(b"fake video bytes")

    upload_count = {"n": 0}

    def _fake_download(url: str) -> str:
        return fake_local

    def _fake_upload(local_path, job_id, filename, *, bucket=None) -> str:
        upload_count["n"] += 1
        return f"https://oss.example/{filename}"

    def _fake_render(src_path, out_path, tgt_w, tgt_h, src_w, src_h):
        with open(out_path, "wb") as f:
            f.write(b"rendered")

    fake_probe = {
        "streams": [{"codec_type": "video", "width": 1920, "height": 1080}]
    }

    with (
        patch("agents.format_export_node._download_to_temp", _fake_download),
        patch("agents.format_export_node.upload_export_to_oss", _fake_upload),
        patch("agents.format_export_node._render_export", _fake_render),
        patch("agents.format_export_node.ffmpeg") as mock_ffmpeg,
    ):
        mock_ffmpeg.probe.return_value = fake_probe
        exports = await generate_format_exports(
            "https://oss.example/master.mp4", "j1"
        )

    assert set(exports.keys()) == {"aspect_9x16", "aspect_1x1", "aspect_16x9"}
    assert upload_count["n"] == 3


# ---------------------------------------------------------------------------
# 8. format_export_node: exception in generate_format_exports → returns {}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_format_export_node_exception_propagates(monkeypatch):
    """format_export_node re-raises exceptions so LangGraph emits run.error and
    the checkpoint stays resumable. Swallowing would silently drop job_complete."""
    async def _failing(*a, **kw):
        raise RuntimeError("ffmpeg not found")

    monkeypatch.setattr("agents.format_export_node.generate_format_exports", _failing)

    state = {"job_id": "j1", "master_cut_uri": "https://oss.example/jobs/j1/master_cut.mp4"}
    with pytest.raises(RuntimeError, match="ffmpeg not found"):
        await format_export_node(state)
