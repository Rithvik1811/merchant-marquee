# C3 — Shot-List JSON Schema (first cut, Phase 0)

**Draft:** RR · **Sign-off:** both (KR + RR) · **Status:** first cut v1 — frozen at end of Phase 2
**Code of record:** [`backend/graph/shot_schema.py`](../backend/graph/shot_schema.py) (Pydantic, runtime-validated)
**Typed-state counterpart:** `graph.state.Shot` / `graph.state.ShotJustification` (C1 — shape for typing only, no runtime checks)
**Related contracts:** C1 state schema, C2 event schema (`shot_generated` event carries this shape)
**Spec background:** `docs/TECHNICAL_DOCUMENTATION.md` §2.2 (mechanical validation), §5.6 (Shot-List Agent + Justification Validator)

## What this is

The Shot-List Agent produces 3-7 shots per job as raw LLM JSON output. `graph.state.Shot`
(a `TypedDict`, part of C1) describes that shape for static typing, but a `TypedDict`
performs **no runtime validation** — anything can be assigned to it silently. C3 is the
actual runtime gate: a Pydantic model (`ShotModel` / `ShotJustificationModel`) that the
raw LLM output must pass before it's trusted anywhere downstream.

```python
from graph.shot_schema import validate_shot_list

shots = validate_shot_list(raw_json_from_llm)  # raises pydantic.ValidationError on any problem
```

## The hard rule this mechanically enforces

**No `product_category` field, ever.** `ShotModel`/`ShotJustificationModel` both set
`extra="forbid"`, so a shot carrying a `product_category` key (or *any* undeclared key)
fails validation immediately — this is the concrete, code-level mechanism behind the
project's core anti-genericness pillar (camera/shot choices must be justified by the
specific script + specific product truths, never a category lookup). It is not a prompt
instruction the model could ignore; it's a structural rejection.

## Shot fields

| Field | Type | Notes |
|---|---|---|
| `shot_id` | `str` | non-empty |
| `t_start`, `t_end` | `float` | seconds; `t_end > 0`, `t_start >= 0` |
| `beat_role` | enum | `hook` \| `problem` \| `demo` \| `proof` \| `cta` |
| `description` | `str` | non-empty |
| `shot_type` | enum | `hook_hero` \| `macro_detail` \| `lifestyle_context` \| `hero_reframe` \| `cta_endcard` |
| `camera_move` | enum | `push_in` \| `orbit` \| `static` \| `pan` \| `tilt_up` \| `pull_back` |
| `framing` | enum | `fills_frame` \| `rule_of_thirds_left` \| `rule_of_thirds_right` \| `context_wide` |
| `lighting` | `str` | shared string, same across every shot in a job |
| `negative_prompt` | `str` | |
| `reference_image_id` | `str` | non-empty — which product photo this shot is conditioned on |
| `text_overlay_zone` | enum | `none` \| `left_third` \| `right_third` \| `lower_third` |
| `duration_sec` | `float` | `> 0` |
| `allocated_budget` | `float` | `>= 0` — written by the Budget Gate |
| `voiceover_line` | `str` | |
| `justification` | `ShotJustificationModel` | see below |
| `status` | enum | `pending` \| `generating` \| `passed` \| `fallback` \| `review` |
| `retry_count` | `int` | `>= 0` |

## Justification sub-object fields

| Field | Type | Notes |
|---|---|---|
| `script_quote` | `str` | non-empty — must be verbatim from the winning script |
| `truth_fact_id` | `str` | non-empty — must reference a real `ProductTruth.truth_id` |
| `treatment_ref` | `int` | `>= 0` — index into `Treatment.beat_treatments[]` |

## Scope boundary (what C3 deliberately does NOT do)

This is **structural** validation only: right types, right enum values, required fields
present, no forbidden fields. It does **not**:

- Check that `script_quote` is actually verbatim in the winning script text
- Check that `truth_fact_id` actually exists in `state.product_truths`
- Check that `treatment_ref` actually matches a real `beat_treatments[]` index
- Reject shots whose `description`/`negative_prompt` contain stoplisted words (e.g. "category")

Those four checks are the **semantic Justification Validator** — a separate, later Phase 2
deliverable (KR's task per `docs/BUILD_TASKS.md`), because they require cross-referencing
the actual script/truths/treatment state, not just validating one shot's shape in isolation.
C3 is the fast, cheap, structural gate that runs first; the Justification Validator is the
deeper semantic gate that runs after.

## Example valid shot

```json
{
  "shot_id": "shot_01",
  "t_start": 0.0,
  "t_end": 3.5,
  "beat_role": "hook",
  "description": "Macro push-in on the bottle label as morning light hits the glass",
  "shot_type": "macro_detail",
  "camera_move": "push_in",
  "framing": "fills_frame",
  "lighting": "warm morning window light, soft shadow left",
  "negative_prompt": "warped text, extra objects",
  "reference_image_id": "photo_bottle_01",
  "text_overlay_zone": "none",
  "duration_sec": 3.5,
  "allocated_budget": 12.0,
  "voiceover_line": "Water that actually tastes like something.",
  "justification": {
    "script_quote": "the springs of Sedona, bottled",
    "truth_fact_id": "truth_04",
    "treatment_ref": 0
  },
  "status": "pending",
  "retry_count": 0
}
```

## A known sync-drift risk, flagged honestly

The enum values in `shot_schema.py` are hand-kept in sync with `graph.state.Shot`'s inline
`Literal`s — `TypedDict` Literals aren't separately importable without refactoring `state.py`
(C1's frozen file, out of scope to touch here). **If C1's `Shot` enums ever change, this file
must be updated to match, and both version numbers bumped.**

## Change policy

First cut now; **frozen at the end of Phase 2** (per `docs/BUILD_TASKS.md`), once the real
Shot-List Agent + Justification Validator are built against it and any gaps surface. Until
then, additive/corrective changes are expected — just sync with KR before altering an
existing field's type or removing one.
