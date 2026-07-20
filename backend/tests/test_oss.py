"""
Unit tests for agents/_oss.py — shared OSS upload helper.

Uses an injected fake bucket (same injectable-client pattern as every other
agent module) so no real credentials or network are needed.
"""
from __future__ import annotations

import pytest

from agents._oss import (
    SIGNED_URL_TTL_SEC,
    delete_job_assets,
    oss_job_asset_key,
    oss_object_key,
    persist_remote_video_to_oss,
    upload_audio_to_oss,
    upload_json_to_oss,
    upload_video_to_oss,
)


class _FakeBucket:
    def __init__(self) -> None:
        self.uploads: list[tuple[str, str, dict]] = []
        self.objects: list[str] = []
        self.batch_deletes: list[list[str]] = []

    def put_object_from_file(self, key: str, local_path: str, headers: dict | None = None) -> None:
        self.uploads.append((key, local_path, headers or {}))

    def sign_url(self, method: str, key: str, expires: int, slash_safe: bool = False) -> str:
        return f"https://oss.example.invalid/{key}?expires={expires}&method={method}&slash_safe={slash_safe}"

    def list_objects(self, prefix: str = "", marker: str = "", max_keys: int = 100):
        matching = sorted(k for k in self.objects if k.startswith(prefix))
        start = matching.index(marker) if marker else 0
        page = matching[start : start + max_keys]
        end = start + len(page)
        truncated = end < len(matching)
        return _ListObjectsResult(
            object_list=[_SimplifiedObjectInfo(k) for k in page],
            is_truncated=truncated,
            next_marker=matching[end] if truncated else "",
        )

    def batch_delete_objects(self, keys: list[str]) -> None:
        self.batch_deletes.append(list(keys))
        self.objects = [k for k in self.objects if k not in keys]


class _SimplifiedObjectInfo:
    def __init__(self, key: str) -> None:
        self.key = key


class _ListObjectsResult:
    def __init__(self, object_list, is_truncated, next_marker) -> None:
        self.object_list = object_list
        self.is_truncated = is_truncated
        self.next_marker = next_marker


def test_oss_object_key_namespace():
    assert oss_object_key("job-42", "s1", "clip.mp4") == "jobs/job-42/shots/s1/clip.mp4"


def test_upload_video_to_oss_puts_file_and_returns_signed_url(tmp_path):
    local = tmp_path / "clip.mp4"
    local.write_bytes(b"fake-mp4")
    bucket = _FakeBucket()

    url = upload_video_to_oss(str(local), "job-42", "s1", bucket=bucket)

    assert len(bucket.uploads) == 1
    key, path, headers = bucket.uploads[0]
    assert key == "jobs/job-42/shots/s1/fallback_kenburns.mp4"
    assert path == str(local)
    assert headers["Content-Type"] == "video/mp4"
    assert url.startswith("https://oss.example.invalid/jobs/job-42/shots/s1/fallback_kenburns.mp4")
    assert f"expires={SIGNED_URL_TTL_SEC}" in url


def test_upload_video_to_oss_custom_filename(tmp_path):
    local = tmp_path / "shot.mp4"
    local.write_bytes(b"x")
    bucket = _FakeBucket()

    upload_video_to_oss(str(local), "j1", "s2", filename="shot.mp4", bucket=bucket)

    assert bucket.uploads[0][0] == "jobs/j1/shots/s2/shot.mp4"


def test_persist_remote_video_downloads_uploads_and_cleans_up(tmp_path):
    """A remote clip is downloaded, uploaded under the shot namespace, and the
    temp download is deleted afterwards."""
    downloaded = tmp_path / "wan_clip.mp4"
    downloaded.write_bytes(b"wan-bytes")
    bucket = _FakeBucket()
    seen_urls: list[str] = []

    def _fake_download(url: str) -> str:
        seen_urls.append(url)
        return str(downloaded)

    url = persist_remote_video_to_oss(
        "http://wan.example.com/ephemeral/clip.mp4?token=abc",
        "job-7",
        "s2",
        bucket=bucket,
        download_fn=_fake_download,
    )

    assert seen_urls == ["http://wan.example.com/ephemeral/clip.mp4?token=abc"]
    assert bucket.uploads[0][0] == "jobs/job-7/shots/s2/shot.mp4"
    assert url.startswith("https://oss.example.invalid/jobs/job-7/shots/s2/shot.mp4")
    assert not downloaded.exists()  # temp download cleaned up


def test_oss_job_asset_key_namespace_has_no_shot_segment():
    """Job-level assets (Voiceover + Caption Agent's VO track/captions) live
    under jobs/{job_id}/, not jobs/{job_id}/shots/{...}/ -- there is no shot_id
    for an asset produced once per job."""
    assert oss_job_asset_key("job-42", "voiceover.mp3") == "jobs/job-42/voiceover.mp3"


def test_upload_audio_to_oss_puts_file_with_audio_content_type(tmp_path):
    local = tmp_path / "voiceover.mp3"
    local.write_bytes(b"fake-mp3")
    bucket = _FakeBucket()

    url = upload_audio_to_oss(str(local), "job-7", bucket=bucket)

    key, path, headers = bucket.uploads[0]
    assert key == "jobs/job-7/voiceover.mp3"
    assert headers["Content-Type"] == "audio/mpeg"
    assert url.startswith("https://oss.example.invalid/jobs/job-7/voiceover.mp3")


def test_upload_json_to_oss_puts_file_with_json_content_type(tmp_path):
    local = tmp_path / "captions.json"
    local.write_text("[]")
    bucket = _FakeBucket()

    url = upload_json_to_oss(str(local), "job-7", "captions.json", bucket=bucket)

    key, path, headers = bucket.uploads[0]
    assert key == "jobs/job-7/captions.json"
    assert headers["Content-Type"] == "application/json"
    assert url.startswith("https://oss.example.invalid/jobs/job-7/captions.json")


def test_persist_remote_video_cleans_up_temp_even_on_upload_failure(tmp_path):
    downloaded = tmp_path / "wan_clip.mp4"
    downloaded.write_bytes(b"x")

    class _BoomBucket(_FakeBucket):
        def put_object_from_file(self, key, local_path, headers=None):
            raise OSError("OSS put failed")

    with pytest.raises(OSError):
        persist_remote_video_to_oss(
            "http://wan.example.com/clip.mp4",
            "job-7",
            "s2",
            bucket=_BoomBucket(),
            download_fn=lambda url: str(downloaded),
        )

    assert not downloaded.exists()  # temp still cleaned up despite the failure


def test_delete_job_assets_removes_everything_under_the_job_prefix():
    bucket = _FakeBucket()
    bucket.objects = [
        "jobs/job-9/shots/s1/clip.mp4",
        "jobs/job-9/shots/s2/clip.mp4",
        "jobs/job-9/voiceover.mp3",
        "jobs/job-9/exports/9x16.mp4",
        "jobs/other-job/shots/s1/clip.mp4",  # must NOT be touched
    ]

    deleted = delete_job_assets("job-9", bucket=bucket)

    assert deleted == 4
    assert bucket.objects == ["jobs/other-job/shots/s1/clip.mp4"]


def test_delete_job_assets_paginates_past_max_keys():
    bucket = _FakeBucket()
    bucket.objects = [f"jobs/job-1/shots/s{i}/clip.mp4" for i in range(5)]

    # Force pagination in list_objects by monkeypatching max_keys behavior via
    # a small page size wrapper.
    real_list_objects = bucket.list_objects
    bucket.list_objects = lambda prefix="", marker="", max_keys=2: real_list_objects(prefix, marker, 2)

    deleted = delete_job_assets("job-1", bucket=bucket)

    assert deleted == 5
    assert bucket.objects == []


def test_delete_job_assets_no_matching_objects_returns_zero():
    bucket = _FakeBucket()
    bucket.objects = ["jobs/other-job/voiceover.mp3"]

    deleted = delete_job_assets("job-missing", bucket=bucket)

    assert deleted == 0
    assert bucket.batch_deletes == []
