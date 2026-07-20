"""
Quick reachability test for happyhorse-1.1-i2v on the US Virginia endpoint.
Just submits the job and checks the API response — does NOT wait for generation.
Reports: accepted (task_id returned) or rejected (error/invalid model).

Usage (from backend/):
    .venv\Scripts\python.exe -m derisk.test_happyhorse
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx  # noqa: E402

# Use a small, publicly accessible test image so we don't need OSS upload
_TEST_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png"
_MODEL = "happyhorse-1.1-i2v"


async def test_endpoint(label: str, base_url: str, api_key: str) -> None:
    url = f"{base_url}/services/aigc/video-generation/video-synthesis"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    body = {
        "model": _MODEL,
        "input": {
            "image_url": _TEST_IMAGE_URL,
            "prompt": "A product on a clean white surface, slow push-in camera move.",
        },
        "parameters": {
            "resolution": "720P",
            "duration": 5,
        },
    }

    print(f"\n{'='*60}")
    print(f"Testing: {label}")
    print(f"Endpoint: {url}")
    print(f"Model: {_MODEL}")
    print(f"{'='*60}")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=body)
        data = resp.json()
        print(f"HTTP status: {resp.status_code}")
        print(f"Response: {json.dumps(data, indent=2)}")

        if resp.status_code in (200, 201) and data.get("output", {}).get("task_id"):
            print(f"\n[ACCEPTED] task_id: {data['output']['task_id']}")
            print("   Model IS available on this endpoint.")
        elif "error" in data or "code" in data:
            code = data.get("code") or data.get("error", {}).get("code")
            msg = data.get("message") or data.get("error", {}).get("message", "")
            print(f"\n[REJECTED] code: {code}, message: {msg}")
        else:
            print(f"\n[UNEXPECTED] check response above")
    except Exception as exc:
        print(f"\n[FAILED] {type(exc).__name__}: {exc}")


async def main() -> None:
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    us_base = os.environ.get("DASHSCOPE_VIDEO_BASE_URL", "https://dashscope-us.aliyuncs.com/api/v1")
    sg_base = os.environ.get("DASHSCOPE_INTL_VIDEO_BASE_URL", "https://dashscope-intl.aliyuncs.com/api/v1")
    sg_key = os.environ.get("DASHSCOPE_VIDEO_INTL_API_KEY", api_key)

    print(f"Testing {_MODEL} on US and Singapore endpoints...")

    await test_endpoint("US Virginia", us_base, api_key)
    await test_endpoint("Singapore (intl)", sg_base, sg_key)

    print(f"\n{'='*60}")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
