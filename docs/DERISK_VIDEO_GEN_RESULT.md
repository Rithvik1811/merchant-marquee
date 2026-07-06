# Phase 0 De-Risk Result: Wan/HappyHorse Image-to-Video (RR)

**Task (per `docs/BUILD_TASKS.md`, RR / Phase 0):** raw quality test of Wan/HappyHorse image-to-video generation — real product photos, multiple camera moves, multiple prompt styles. Save outputs, honest go/no-go verdict, note latency + hard-failure behavior.

## Verdict: **GO**

Image-to-video generation via DashScope (`wan2.6-i2v-us`) reliably produces identity-consistent, camera-literate, narratively-directable product ad shots — including convincing human interaction, facial expression, and hallucinated environments — from a single product reference photo. There is one well-understood, narrow, designable-around failure mode (fine print during tight push-ins) and one preventable failure mode (product/character dropping out of frame during hard scene transitions, fixed by explicit anti-cut prompt language). Nothing found here blocks building the rest of the pipeline on top of this model.

---

## 1. Setup

- **Model:** `wan2.6-i2v-us` (region-scoped to the `dashscope-us` endpoint — see §5 for how we found this)
- **Test photos:** 4 real product photos (branded matte mug, reflective glass bottle w/ label, textured canvas tote, colorful layered soap) + 1 clean vector mockup mug, covering: printed logos, fine label text, reflective/transparent surfaces, texture/pattern, flat color
- **Test matrix:** 8 base cases (camera moves: push-in / orbit / static; prompt styles: technical / moody) + 2 final narrative cases with humans (face-forward reaction shot, hook-style office scene)
- **Total clips generated:** 12 (10 succeeded, 2 failures — both were the deliberately-out-of-region `wanx2.1-i2v-plus` fallback model, not `wan2.6-i2v-us`)

## 2. Latency

| | |
|---|---|
| Range | 42.0s – 99.1s per 5-second clip |
| Typical | ~45-90s |
| Hard failures | 0 on the correct model ID; instant (`<2s`) `400 Model not exist` / `InvalidApiKey` failures on wrong model ID or wrong-region key — fails fast, does not hang |

**Implication:** with parallel fan-out (`Send()` per shot, per the architecture), a 5-7 shot ad should generate in roughly one clip's worth of wall-clock time, not sum of all shots — worth confirming at real pipeline scale in Phase 3.

## 3. Identity retention — refined finding

Initial testing suggested "fine print breaks under zoom," but the full matrix narrows this considerably:

| Case | Camera move | Result |
|---|---|---|
| Mug logo ("EXCELSO"), static mockup tagline | static / orbit | **Perfectly legible**, no degradation |
| Rainbow soap color/pattern | orbit **and** extreme push-in | **Perfectly preserved**, no color shift even at closest zoom |
| Bottle primary brand ("Purely SEDONA") | push-in | **Stays legible** even close-up |
| Bottle fine print (subtitle, volume text) | push-in | **Degrades to gibberish** — reproduced identically across 2 separate runs |
| Mug logo, face-forward reaction shot | push-in, held near face | **Perfectly legible** throughout, including while occluded by hand/fingers |

**Conclusion:** the failure mode is specifically *small/fine-print text during a tight push-in*, not a general weakness. Large/primary branding, logos, color, pattern, and texture all hold up across every camera move tested, including aggressive close-ups. This is a narrow, well-understood constraint, not a broad quality ceiling.

**Design implication for Treatment/Shot-List Agents:** avoid framing tight push-ins on small print (ingredient lists, secondary stamps/text); keep close-ups centered on primary branding or texture/color, which are robust.

## 4. Human generation — the core creative-quality question

This was the most important open question (per the earlier "must not be generic/templated" and "must support real story-driven ads with people" discussions). Findings, from simplest to hardest test:

1. **Hand + product interaction** (hand reaching for/gripping the bottle): anatomically correct hands (no extra/fused fingers) across all sampled frames; model hallucinated a fully coherent, consistent sunlit kitchen environment not present in the source photo at all.
2. **Full-body human + product** (person walking with the tote bag): convincing walk cycle, hair/fabric motion, hallucinated street scene — **but** the product visibly vanished from frame for at least one sampled moment during the scene transition (see §6, this is the one real caught failure).
3. **Face-forward reaction shot** (person drinking from the mug, eyes closing into a genuine smile): the hardest test attempted. Result: natural, non-uncanny facial expression, correct teeth rendering, symmetrical smile, no dead-eyes effect — the full "sip → close eyes → open into smile" emotional beat rendered as directed, while the logo stayed legible the entire time, including while held near/occluded by the face.
4. **Face-forward narrative arc with lighting direction** (tired person drinks from bottle, relief sets in): the **same character** (face, glasses, hair, clothing) stayed identity-consistent for the full clip; the lighting shifted from cool to warm exactly on the cue given in the prompt ("shifting subtly warmer as they drink"); the product did **not** vanish this time, because the prompt explicitly said "no scene cut, product never leaves frame."

**Conclusion:** the model can generate believable, emotionally-directed human-product interaction — including faces — from a product-only reference photo. This directly de-risks the core creative ambition (real director/cinematographer-style story ads, not static product turntables).

## 5. Model/region gotcha (worth documenting so KR doesn't hit the same wall)

- The DashScope API key is **region-scoped**: it only authenticates against `dashscope-us`; the mainland (`dashscope.aliyuncs.com`) and international (`dashscope-intl.aliyuncs.com`) endpoints reject it as `InvalidApiKey` outright.
- The native `dashscope` SDK needs the **native API base** (`.../api/v1`), not the OpenAI-*compatible* base used for chat (`.../compatible-mode/v1`) — these are different paths on the same host.
- The video model ID is **region-suffixed** (`wan2.6-i2v-us`), not the generic `wanx2.1-i2v-*` IDs baked into the installed SDK version — those return `400 Model not exist` on this account/region even though auth succeeds. Always check the current `backend/.env.example` for the live model ID; it changed twice already during this session as KR corrected it.

## 6. Continuity risk (validates an existing architecture decision)

During the tote-bag walking test, the product genuinely disappeared from frame for at least one sampled moment right at the transition from "static product" to "in-motion scene." This is a live, concrete example of exactly the failure mode the **Continuity Agent** (Qwen-VL drift scoring + capped retry, `docs/TECHNICAL_DOCUMENTATION.md` §5.10) exists to catch — not hypothetical scaffolding.

It also appears **preventable at the prompt level**: the follow-up test that explicitly instructed "static medium shot... product never leaves frame, no scene cut" did not reproduce the vanishing-product issue. Recommendation: the Shot-List/Video-Gen prompt construction should always include an explicit anti-cut/continuity clause for any shot involving human interaction, in addition to relying on the Continuity Agent as a backstop.

## 7. Audio (unplanned finding)

`wan2.6-i2v-us` auto-generates a synced audio track by default (confirmed via decoded PCM sample analysis — real signal, not silence, ~-11.8dB RMS, full-range samples). We did not request this and did not evaluate its content quality in depth. **Open question for Phase 5:** decide whether to keep/use this auto-generated audio as an ambient layer, or explicitly override it (the SDK exposes an `audio_setting` param: `"auto"` vs `"origin"`) before layering the Voiceover Agent's TTS track on top, to avoid the two clashing.

## 8. Prompt style (technical vs. moody)

Confirmed to meaningfully change lighting/mood/background (clean neutral studio vs. warm gradient backdrop) without any difference in identity fidelity between the two — good evidence that prompt-style variation is a real creative lever for the Treatment Agent to use, not cosmetic noise that gets ignored.

## 9. Raw outputs

All generated clips and the raw `results.json` / `final_results.json` logs are in `backend/derisk/outputs/`. Test photos are in `backend/derisk/photos/`. Reproducible via `backend/derisk/test_video_gen.py` (`python test_video_gen.py` for the base matrix, `python test_video_gen.py final` for the human/narrative cases).

## 10. Recommendations going into Phase 1+

1. Treatment Agent / Shot-List Agent should avoid tight push-ins on secondary/fine-print text; primary branding, texture, and color are safe at any camera distance.
2. Any shot involving a human + product transition should include explicit "product/character never leaves frame, no hard cut" language in the generation prompt, in addition to the Continuity Agent backstop.
3. Confirm the exact `MODEL_VIDEO` value in `backend/.env` before any teammate runs generation — it's region- and account-specific and has already changed twice.
4. Decide on the auto-generated audio track's role before Phase 5 (Voiceover Agent) — likely override it (`audio_setting="origin"` or mute) to avoid clashing with the real VO track, but worth a deliberate listen-through first.
5. At real pipeline scale (3-7 shots via `Send()` fan-out), confirm parallel generation latency stays close to single-clip latency rather than summing.
