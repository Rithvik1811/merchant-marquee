"""
Derisk test for qwen3-tts-instruct-flash-realtime — hear the voice before committing.
Tests 3 voices (Cherry, Serena, Ethan) with and without instruction control,
using realistic ad VO lines from the pipeline.

Tries two API paths in order:
  1. OpenAI-compatible REST  (/audio/speech) via DASHSCOPE_TTS_BASE_URL
  2. DashScope WebSocket SDK  (SpeechSynthesizer) as fallback

Saves MP3s to backend/derisk/outputs/tts_*.mp3 — open them to compare.

Usage (from backend/):
    .venv\\Scripts\\python.exe -m derisk.test_qwen3_tts
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

OUTPUTS_DIR = Path(__file__).resolve().parent / "outputs"

MODEL = "qwen3-tts-instruct-flash-realtime"
WS_URL = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference"

# Realistic ad VO lines — same style the pipeline generates
SAMPLES = [
    {
        "label": "hook",
        "text": "You've got five seconds. Make them count.",
        "instruction": "Speak with quiet confidence. Slow, deliberate pause after the first sentence.",
    },
    {
        "label": "transformation",
        "text": "Miles from the trailhead. Still ice-cold.",
        "instruction": "Warm, understated. Like you're telling a friend something that actually surprised you.",
    },
    {
        "label": "cta",
        "text": "Built for people who don't stop. Get yours.",
        "instruction": "Energetic but not shouty. End on a rising tone.",
    },
]

VOICES = ["Cherry", "Ethan", "Serena"]


def _synth_rest(text: str, voice: str, instruction: str | None = None) -> bytes:
    """OpenAI-compatible /audio/speech REST endpoint."""
    from openai import OpenAI

    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    base_url = os.environ.get(
        "DASHSCOPE_TTS_BASE_URL",
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )

    client = OpenAI(api_key=api_key, base_url=base_url)

    extra = {}
    if instruction:
        extra["instruction"] = instruction

    resp = client.audio.speech.create(
        model=MODEL,
        voice=voice,
        input=text,
        response_format="mp3",
        extra_body=extra if extra else None,
    )
    return resp.content


def _synth_ws(text: str, voice: str, instruction: str | None = None) -> bytes:
    """DashScope WebSocket SDK fallback."""
    import dashscope
    from dashscope.audio.tts_v2 import SpeechSynthesizer, AudioFormat

    api_key = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("DASHSCOPE_TTS_API_KEY")
    if not api_key:
        raise RuntimeError("No DASHSCOPE_API_KEY found in environment")
    dashscope.api_key = api_key

    kwargs = dict(
        model=MODEL,
        voice=voice,
        format=AudioFormat.MP3_22050HZ_MONO_256KBPS,
        url=WS_URL,
    )
    if instruction:
        kwargs["instruction"] = instruction

    synth = SpeechSynthesizer(**kwargs)
    audio = synth.call(text)
    if not audio:
        raise RuntimeError(f"Empty audio returned for voice={voice!r}")
    return audio


def _synth(text: str, voice: str, instruction: str | None = None) -> tuple[bytes, str]:
    """Try REST first, fall back to WebSocket SDK. Returns (audio, method_used)."""
    try:
        audio = _synth_rest(text, voice, instruction)
        return audio, "rest"
    except Exception as rest_exc:
        try:
            audio = _synth_ws(text, voice, instruction)
            return audio, "ws"
        except Exception as ws_exc:
            raise RuntimeError(
                f"REST: {rest_exc} | WS: {ws_exc}"
            ) from ws_exc


def main() -> int:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Model: {MODEL}")
    print(f"Testing {len(VOICES)} voices x {len(SAMPLES)} lines\n")

    ok = 0
    fail = 0

    for sample in SAMPLES:
        for voice in VOICES:
            label = f"{sample['label']}_{voice.lower()}"
            out_path = OUTPUTS_DIR / f"tts_{label}.mp3"
            instruction = sample["instruction"]
            print(f"  [{label}] instruction: \"{instruction}\"")
            print(f"          text: \"{sample['text']}\"")
            try:
                audio, method = _synth(sample["text"], voice, instruction)
                out_path.write_bytes(audio)
                print(f"          -> saved ({len(audio):,} bytes) via {method}: {out_path.name}")
                ok += 1
            except Exception as exc:
                print(f"          -> FAILED: {exc}", file=sys.stderr)
                fail += 1
            print()

    print(f"Done: {ok} succeeded, {fail} failed.")
    print(f"Audio files in: {OUTPUTS_DIR}")
    print("Open the MP3s and compare voices to pick the best one.")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
