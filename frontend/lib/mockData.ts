// ProductCut — mock job data (matches backend C1 job-state schema shape).
// Swap this module for real API payloads later; the shapes are the contract.

import type {
  Budget,
  Final,
  MergeValidation,
  Product,
  Scores,
  Script,
  Shot,
  Treatment,
  Truth,
} from "./types";

export const PRODUCT: Product = {
  name: "Marigold Stoneware Mug",
  seller: "Fernwood Clay Co.",
};

// ---- Product truths ---------------------------------------------------------
export const TRUTHS: Truth[] = [
  { id: "t1", category: "material", fact_text: "Wheel-thrown stoneware finished with a matte, food-safe glaze." },
  { id: "t2", category: "color", fact_text: "Warm terracotta body fading into a speckled cream interior." },
  { id: "t3", category: "texture", fact_text: "Soft hand-thrown ridges wrap the body — visibly not machine-made." },
  { id: "t4", category: "distinguishing_mark", fact_text: "A small maker's stamp is pressed into the unglazed base." },
  { id: "t5", category: "size", fact_text: "Holds ~12 oz with a comfortable two-finger handle." },
  { id: "t6", category: "shape", fact_text: "Gently tapered body meets a rounded, easy-sip lip." },
];

// ---- Scripting + critic -----------------------------------------------------
export const SCORE_WEIGHTS: Scores = { hook: 25, pacing: 20, completion: 20, cta: 20, tone: 15 };

function weighted(s: Scores): number {
  return Math.round(
    (s.hook * SCORE_WEIGHTS.hook +
      s.pacing * SCORE_WEIGHTS.pacing +
      s.completion * SCORE_WEIGHTS.completion +
      s.cta * SCORE_WEIGHTS.cta +
      s.tone * SCORE_WEIGHTS.tone) /
      100,
  );
}

type ScriptSeed = Omit<Script, "total">;

const SCRIPT_SEEDS: ScriptSeed[] = [
  {
    id: "v1",
    title: "Morning Ritual",
    scores: { hook: 82, pacing: 74, completion: 88, cta: 70, tone: 90 },
    reasoning:
      "Opens on the quiet of a first pour. Strong emotional tone and a complete arc, but the hook leans familiar and the CTA arrives soft — viewers may not feel urgency to shop.",
    lines: [
      "The house is still quiet.",
      "You reach for the one that feels right in your hands.",
      "Terracotta outside, speckled cream within.",
      "Some mornings deserve a real cup.",
    ],
  },
  {
    id: "v2",
    title: "The Maker's Hands",
    scores: { hook: 76, pacing: 88, completion: 80, cta: 72, tone: 94 },
    reasoning:
      "Beautiful, tactile pacing and the warmest tone of the four. Loses points on hook strength and a slightly unresolved ending — the shape story is set up but never paid off.",
    lines: [
      "Thrown on a wheel, not stamped from a mold.",
      "You can feel every ridge the hand left behind.",
      "Fired once, glazed matte, fired again.",
      "Made to be held.",
    ],
  },
  {
    id: "v3",
    title: "The Last Cup",
    winner: true,
    scores: { hook: 91, pacing: 86, completion: 90, cta: 84, tone: 88 },
    reasoning:
      "Best hook of the set and a tight, honest arc that lands the CTA without overselling. Every line traces to a verified truth — no invented claims. Selected as the winning cut.",
    lines: [
      "No two are the same.",
      "The maker's stamp on the base proves it.",
      "Twelve honest ounces, a handle for two fingers.",
      "Get yours before the batch is gone.",
    ],
  },
  {
    id: "v4",
    title: "Unbox Calm",
    scores: { hook: 84, pacing: 70, completion: 76, cta: 90, tone: 80 },
    reasoning:
      "Sharpest CTA and a punchy hook, but pacing stutters in the middle and the arc feels transactional against the product’s handmade story. Tone slightly off-brand.",
    lines: [
      "Open the box. Feel the weight.",
      "Matte glaze, food-safe, dishwasher-friendly.",
      "This is the mug you keep reaching for.",
      "Shop the drop today.",
    ],
  },
];

export const SCRIPTS: Script[] = SCRIPT_SEEDS.map((s) => ({ ...s, total: weighted(s.scores) }));

export const WINNER_ID = "v3";

// Merge validation — the seam-repair story (judged technical-depth feature).
export const MERGE_VALIDATION: MergeValidation = {
  status: "pass",
  repairPath: "Copy Editor seam polish", // vs 'Meta-Critic swap'
  metaCriticSwapFired: false,
  note: "Seam between beat 2 and beat 3 read as an abrupt jump. Copy Editor smoothed the transition without altering any factual claim. Meta-Critic swap was not required.",
  seam: {
    location: "Beat 2 → Beat 3",
    before: "The maker's stamp on the base proves it. Twelve honest ounces, a handle for two fingers.",
    after:
      "The maker's stamp on the base proves it — and it holds twelve honest ounces, with a handle sized for two fingers.",
  },
};

// ---- Director's treatment ---------------------------------------------------
export const TREATMENT: Treatment = {
  director_persona:
    "A patient documentarian of small things — shoots the object like a portrait, lets silence do the selling.",
  color_story:
    "Low kelvin morning light. Terracotta warms against a cool slate backdrop; cream interior catches the highlight.",
  pacing_philosophy: "Slow holds, one honest cut per claim. Nothing moves faster than a hand would.",
  beats: [
    {
      id: "b1",
      script_quote: "No two are the same.",
      truth_fact_id: "t3",
      why_not_generic: "Opens on the ridges themselves, not a spinning hero shot — proves handmade instead of asserting it.",
    },
    {
      id: "b2",
      script_quote: "The maker's stamp on the base proves it.",
      truth_fact_id: "t4",
      why_not_generic: "A literal, tactile proof point. Most ads skip the base; we make it the evidence.",
    },
    {
      id: "b3",
      script_quote: "Twelve honest ounces, a handle for two fingers.",
      truth_fact_id: "t5",
      why_not_generic: 'Grounds the practical claim in the exact number and grip — no vague "generous size" filler.',
    },
    {
      id: "b4",
      script_quote: "Get yours before the batch is gone.",
      truth_fact_id: "t1",
      why_not_generic: "Ties scarcity to the small-batch firing process, not a fake countdown timer.",
    },
  ],
};

// ---- Budget ledger ----------------------------------------------------------
export const BUDGET: Budget = {
  unit: "credits",
  cap: 120,
  shots: [
    { id: "s1", label: "Shot 1 · Ridges macro", alloc: 22, justification: "Macro detail needs the highest fidelity model pass — this is the proof shot." },
    { id: "s2", label: "Shot 2 · Base stamp", alloc: 18, justification: "Close-up with shallow depth of field; moderate cost, high narrative payoff." },
    { id: "s3", label: "Shot 3 · In-hand hold", alloc: 20, justification: "Motion + hand interaction raises generation cost." },
    { id: "s4", label: "Shot 4 · Pour + steam", alloc: 24, justification: "Fluid + steam simulation is the most expensive beat." },
    { id: "s5", label: "Shot 5 · Shelf lineup", alloc: 14, justification: "Static product row; cheaper, reused lighting setup." },
    { id: "s6", label: "Shot 6 · Logo + CTA", alloc: 10, justification: "Text + still composite; lowest cost." },
  ],
};

// ---- Shot generation --------------------------------------------------------
export const SHOTS: Shot[] = [
  { id: "s1", label: "Ridges macro", camera: "100mm macro", move: "Slow push-in", duration: "2.5s", fallback: false },
  { id: "s2", label: "Base stamp", camera: "85mm", move: "Rack focus to base", duration: "2.0s", fallback: false },
  { id: "s3", label: "In-hand hold", camera: "50mm", move: "Handheld drift", duration: "3.0s", fallback: false },
  { id: "s4", label: "Pour + steam", camera: "35mm", move: "Locked tripod", duration: "3.0s", fallback: false },
  { id: "s5", label: "Shelf lineup", camera: "50mm", move: "Lateral dolly", duration: "2.5s", fallback: true }, // Ken-Burns fallback
  { id: "s6", label: "Logo + CTA", camera: "Composite", move: "Static", duration: "2.0s", fallback: false },
];

// ---- Continuity / drift -----------------------------------------------------
// Lower drift is better. Threshold for auto-accept: <= 0.25.
export const DRIFT_THRESHOLD = 0.25;
export const DRIFT: Record<string, number> = {
  s1: 0.08,
  s2: 0.11,
  s3: 0.19,
  s4: 0.42,
  s5: 0.14,
  s6: 0.06,
};

// Human-review interrupt (retries exhausted on the pour+steam shot).
export const INTERRUPT = {
  shotId: "s4",
  label: "Shot 4 · Pour + steam",
  driftScore: 0.42,
  reason: "Steam plume drifts across the logo and the mug color shifts between candidate frames. Retries exhausted (3/3).",
  candidates: [
    { id: "c1", note: "Frame A — steam covers rim" },
    { id: "c2", note: "Frame B — color shift on body" },
    { id: "c3", note: "Frame C — closest to reference" },
  ],
};

// ---- Final output -----------------------------------------------------------
export const FINAL: Final = {
  duration: "15s",
  ratios: [
    { id: "9:16", label: "Vertical", use: "Reels · TikTok · Stories", w: 9, h: 16 },
    { id: "1:1", label: "Square", use: "Feed posts", w: 1, h: 1 },
    { id: "16:9", label: "Landscape", use: "YouTube · site hero", w: 16, h: 9 },
  ],
};
