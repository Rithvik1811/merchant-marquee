"""
Derisk test: wanx2.1-imageedit — can it generate a new scene with the
product kept but the background replaced?

Tests three scene prompts against the BlendJet 2 product photo using the
description_edit function.

Run:
    cd backend
    .venv/Scripts/python.exe derisk/test_imageedit.py

Results saved to backend/derisk/imageedit_results/
"""
from __future__ import annotations

import os
import sys
import time
import urllib.request
from pathlib import Path

# Load .env manually
env_path = Path(__file__).parent.parent / ".env"
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

# Add backend to sys.path so we can import _oss
sys.path.insert(0, str(Path(__file__).parent.parent))

import dashscope
from dashscope import ImageSynthesis

OUTPUT_DIR = Path(__file__).parent / "imageedit_results"
OUTPUT_DIR.mkdir(exist_ok=True)

PRODUCT_PHOTO = Path(__file__).parent / "photos" / "blendjet_2.jpg"
MODEL = "wanx2.1-imageedit"

TESTS = [
    {
        "name": "outdoor_trail",
        "prompt": (
            "Place the teal portable blender on a wooden picnic table beside a mountain trail. "
            "Surround it with pine trees and soft morning mist. Keep the blender's exact teal "
            "color, shape, size, and silicone loop handle unchanged. Photorealistic, natural light."
        ),
    },
    {
        "name": "kitchen_morning",
        "prompt": (
            "Place the teal portable blender on a bright white kitchen counter next to a bowl "
            "of fresh strawberries. Morning sunlight streaming through a window behind it. "
            "Keep the blender's exact teal color, shape, size, and loop handle unchanged. "
            "Photorealistic, warm natural light."
        ),
    },
    {
        "name": "gym_bag",
        "prompt": (
            "Place the teal portable blender on top of a black gym bag on a locker room bench. "
            "Gym equipment in soft-focus background. Keep the blender's exact teal color, shape, "
            "size, and loop handle unchanged. Photorealistic, indoor athletic lighting."
        ),
    },
]


def upload_product_photo_to_oss() -> str:
    """Upload the product photo to our OSS bucket and return a signed URL."""
    import oss2

    auth = oss2.Auth(os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"])
    bucket = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET"])

    key = "derisk/imageedit_source/blendjet_2.jpg"
    print(f"Uploading product photo to OSS: {key}")
    bucket.put_object_from_file(key, str(PRODUCT_PHOTO), headers={"Content-Type": "image/jpeg"})
    signed_url = bucket.sign_url("GET", key, 24 * 3600, slash_safe=True)
    print(f"Signed URL: {signed_url[:80]}...")
    return signed_url


def run_test(test: dict, image_url: str, api_key: str) -> bool:
    name = test["name"]
    print(f"\n  Prompt: {test['prompt'][:80]}...")

    t0 = time.time()
    try:
        rsp = ImageSynthesis.call(
            model=MODEL,
            prompt=test["prompt"],
            function="description_edit",
            base_image_url=image_url,
            n=1,
            api_key=api_key,
        )
    except Exception as exc:
        print(f"  [CALL ERROR] {exc}")
        return False

    elapsed = time.time() - t0

    if rsp.status_code != 200:
        print(f"  [API ERROR {rsp.status_code}] {rsp.message}")
        return False

    try:
        results = rsp.output.results
    except AttributeError:
        print(f"  [PARSE ERROR] response: {rsp}")
        return False

    if not results:
        print(f"  [NO RESULTS] response: {rsp}")
        return False

    for i, result in enumerate(results):
        url = result.url
        out_path = OUTPUT_DIR / f"{name}_{i}.jpg"
        try:
            urllib.request.urlretrieve(url, out_path)
            size_kb = out_path.stat().st_size // 1024
            print(f"  [OK] Saved → {out_path.name} ({size_kb} KB, {elapsed:.1f}s)")
        except Exception as exc:
            print(f"  [DOWNLOAD ERROR] {exc}")
            return False

    return True


def try_api_key(label: str, api_key: str, image_url: str) -> None:
    print(f"\n{'='*60}")
    print(f"API key: {label} ({api_key[:16]}...)")
    any_ok = False
    for test in TESTS:
        print(f"\n--- {test['name']} ---")
        ok = run_test(test, image_url, api_key)
        if ok:
            any_ok = True

    if any_ok:
        print(f"\n[VERDICT] {label}: wanx2.1-imageedit WORKS")
    else:
        print(f"\n[VERDICT] {label}: wanx2.1-imageedit FAILED")


def main() -> None:
    if not PRODUCT_PHOTO.exists():
        print(f"ERROR: {PRODUCT_PHOTO} not found")
        sys.exit(1)

    print(f"Model: {MODEL}")
    print(f"Product photo: {PRODUCT_PHOTO}")

    # Step 1: upload photo to OSS to get a public HTTPS URL
    try:
        image_url = upload_product_photo_to_oss()
    except Exception as exc:
        print(f"OSS upload failed: {exc}")
        sys.exit(1)

    # Step 2: try US region key
    us_key = os.environ.get("DASHSCOPE_API_KEY", "")
    intl_key = os.environ.get("DASHSCOPE_VIDEO_INTL_API_KEY", "")

    try_api_key("US (DASHSCOPE_API_KEY)", us_key, image_url)

    # Step 3: try INTL key if different
    if intl_key and intl_key != us_key:
        try_api_key("INTL (DASHSCOPE_VIDEO_INTL_API_KEY)", intl_key, image_url)

    print(f"\nResults in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
