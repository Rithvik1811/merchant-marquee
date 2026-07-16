"""
Probe: is cosyvoice-v3-flash available on the Singapore/intl DashScope region?

Uses DASHSCOPE_VIDEO_INTL_API_KEY (same key as DASHSCOPE_TTS_API_KEY in .env)
pointed at dashscope-intl.aliyuncs.com. If it returns audio, we can upgrade
voiceover_caption_agent.py to v3 and get instruction-based emotion control.

Usage (from backend/):
    python -m derisk.test_cosyvoice3_intl
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SAMPLE_TEXT = "Your coffee stays hot for twelve hours. Guaranteed."
INTL_API_KEY = os.environ.get("DASHSCOPE_VIDEO_INTL_API_KEY") or os.environ.get("DASHSCOPE_TTS_API_KEY")
INTL_BASE_URL = "https://dashscope-intl.aliyuncs.com"

# SpeechSynthesizer uses WebSocket internally — needs the sk-ws-... token,
# not the standard sk-... REST API key. The intl WebSocket key is in
# DASHSCOPE_TTS_API_KEY / DASHSCOPE_VIDEO_INTL_API_KEY.
#
# instruct_text for v3 goes in the SpeechSynthesizer constructor, not .call().

MODELS_TO_TRY = [
    ("cosyvoice-v2",       "longxiaochun_v2", None,  True),   # v2 baseline, use default URL
    ("cosyvoice-v2",       "longxiaochun_v2", None,  False),  # v2 baseline, force intl URL
    ("cosyvoice-v3-flash", "longanyang",      None,  False),  # v3-flash no instruction
    ("cosyvoice-v3-flash", "longanyang",      "你说话时充满热情和兴奋。", False),  # v3-flash with instruction
    ("cosyvoice-v3-plus",  "longanyang",      None,  False),  # v3-plus no instruction
    ("cosyvoice-v3-plus",  "longanyang",      "你说话时充满热情和兴奋。", False),  # v3-plus with instruction
    ("cosyvoice-v3-plus",  "longanhuan",      "你说话时充满热情和兴奋。", False),  # v3-plus alt voice
]


INTL_WS_URL = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference"


def probe_one(model: str, voice: str, instruct_text: str | None, use_default_url: bool) -> tuple[bool, str]:
    import dashscope
    from dashscope.audio.tts_v2 import SpeechSynthesizer, AudioFormat

    dashscope.api_key = INTL_API_KEY

    try:
        kwargs = dict(
            model=model,
            voice=voice,
            format=AudioFormat.MP3_22050HZ_MONO_256KBPS,
        )
        if not use_default_url:
            kwargs["url"] = INTL_WS_URL
        if instruct_text:
            kwargs["instruction"] = instruct_text

        synthesizer = SpeechSynthesizer(**kwargs)
        audio = synthesizer.call(SAMPLE_TEXT)

        if audio and len(audio) > 1000:
            return True, f"OK -- {len(audio)} bytes"
        elif audio:
            return False, f"suspicious -- only {len(audio)} bytes"
        else:
            # Pull last server response to surface any error code/message
            last = getattr(synthesizer, "last_response", None)
            detail = repr(last) if last else "empty response (no audio, no error)"
            return False, detail
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def main() -> int:
    if not INTL_API_KEY:
        print("ERROR: DASHSCOPE_VIDEO_INTL_API_KEY / DASHSCOPE_TTS_API_KEY not set in .env", file=sys.stderr)
        return 1

    print(f"Probing Singapore/intl region ({INTL_BASE_URL}) with key {INTL_API_KEY[:12]}...\n")

    any_v3 = False
    for model, voice, instruct, default_url in MODELS_TO_TRY:
        url_label = "default-url" if default_url else "intl-url"
        label = f"{model} / {voice} [{url_label}]" + (" + instruct" if instruct else "")
        ok, detail = probe_one(model, voice, instruct, default_url)
        status = "AVAILABLE" if ok else "unavailable"
        print(f"  {status:14s}  {label}")
        print(f"               {detail}")
        if ok and "v3" in model:
            any_v3 = True

    print()
    if any_v3:
        print("cosyvoice-v3 IS available on the Singapore/intl region.")
        print("You can upgrade voiceover_caption_agent.py to use it with instruction-based emotion control.")
        return 0
    else:
        print("cosyvoice-v3 is NOT available on the Singapore/intl region.")
        print("cosyvoice-v2 (already implemented) is the best available option.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
