# C2 — WebSocket Event Schema (frozen contract, Phase 0)

**Draft:** RR · **Sign-off:** both (KR + RR) · **Status:** frozen v1, additive-only
**Code of record:** [`backend/graph/events.py`](../backend/graph/events.py)
**Related contracts:** C1 state schema (`backend/graph/state.py`), C4 human-review payload, C5 edit-request payload
**Spec background:** `docs/TECHNICAL_DOCUMENTATION.md` §9.5 (realtime) and §5 (agent-by-agent)

## What this is

Every message pushed from the FastAPI backend to the frontend over the WebSocket
uses **one envelope shape**:

```json
{ "type": "<event type>", "job_id": "<job id>", "ts": "<ISO-8601 UTC>", "payload": { ... } }
```

`type` is one of the **ten named business events** below (a `Literal`, so it can't
drift). `payload` is the typed shape matching that `type`. The dashboard renders
each panel (product truths, critic trace, budget ledger, drift scores, per-shot
status grid, human-review surfacing, edit-router decisions, final previews)
directly off these payloads.

Payloads **reuse the C1 state types** rather than re-describing them — e.g. a
`critic_score` event just carries the existing `CriticScore` objects. If C1
changes a shape, C2 inherits it for free.

Build events with the shared helper so `ts` is always a real timestamp:

```python
from graph.events import build_event
event = build_event("truth_extracted", job_id, {"truths": truths, "count": len(truths)})
```

## Scope boundary (what is deliberately NOT in this contract)

The Phase 0 scaffold (`app/main.py`) also emits `run.started` / `run.completed` /
`run.error` and forwards raw LangGraph `astream_events` internals (`on_chain_start`,
etc.). Those are **transport/lifecycle scaffolding, not frozen business events**,
so they are intentionally excluded here. Freezing them would lock in noise before
the real agent nodes exist. If we later decide a run-lifecycle event belongs in the
contract, we add it additively — with a version bump — rather than retrofitting the
scaffold's ad-hoc strings.

## The ten events

| Event type | Fires when | Emitting agent/node (phase) | Payload shape summary |
|---|---|---|---|
| `node_started` | any graph node begins executing (generic progress heartbeat) | any node (all phases) | `node`, optional `label`, optional `phase` |
| `truth_extracted` | Product Truth Extractor returns its grounded facts | Truth Extractor (P1) | `truths: list[ProductTruth]`, `count: int` |
| `critic_score` | critic chain / Meta-Critic finishes scoring the variants | Critic Chain / Meta-Critic (P1) | `scores: dict[variant_id → CriticScore]`, optional `winning_variant_ids` |
| `treatment_ready` | Treatment Agent output passes the Justification Validator | Treatment Agent (P2) | `treatment: Treatment` |
| `budget_updated` | Budget Gate writes/updates per-shot allocations | Budget Gate (P2) | `ledger: BudgetLedger`, `over_cap: bool` |
| `shot_generated` | one shot finishes generation (real clip **or** Ken-Burns fallback) | Video-Gen / Fallback (P3) | `shot_id`, `generated: GeneratedShot`, `status`, `is_fallback: bool` |
| `drift_scored` | Continuity Agent scores a generated shot vs. reference/style | Continuity Agent (P4) | `shot_id`, `drift_score`, `threshold`, `passed`, `attempt` |
| `interrupt_requested` | retry cap exhausted → a real human-review `interrupt()` is raised | Capped-retry loop (P4) | `review: HumanReviewEntry` (the C4 payload), optional `queue_position` |
| `edit_routed` | Edit Router classifies a chat edit request | Edit Router (P9) | `edit_id`, `router_output: EditRouterOutput` |
| `job_complete` | Assembly + Export finish; deliverables are ready | Assembly/Export (P5) | `master_cut_uri`, `exports: Exports`, optional `voiceover` |

## Design notes / reuse map

- **`truth_extracted`, `critic_score`, `treatment_ready`, `budget_updated`,
  `shot_generated`, `interrupt_requested`, `edit_routed`, `job_complete`** each
  wrap the corresponding C1 type (`ProductTruth`, `CriticScore`, `Treatment`,
  `BudgetLedger`, `GeneratedShot`, `HumanReviewEntry`, `EditRouterOutput`,
  `Exports`/`Voiceover`). No overlapping shapes are redefined.
- **`budget_updated.over_cap`** lets the ledger panel show the loop-back state
  (Budget Gate re-prompting the Shot-List Agent) without the frontend re-deriving
  `spent > cap`.
- **`shot_generated.is_fallback` / `status`** drive the per-shot status grid
  (queued / generating / done / fallback) and distinguish a real Wan clip from a
  Ken-Burns fallback, per the Phase 3 exit criteria.
- **`drift_scored` vs. `interrupt_requested`** are split on purpose: `drift_scored`
  fires on *every* continuity check (including passing ones and each capped retry,
  hence `attempt`), while `interrupt_requested` fires only once retries are
  exhausted and carries the full `HumanReviewEntry` (candidate frames + resolution
  slot) the human-review UI needs.
- **`node_started`** is the one generic lifecycle event kept in the contract
  because the dashboard's job-progress timeline needs a per-node "started" signal
  independent of any business payload.

## Change policy

Additive-only. Add new event types or new payload keys freely (prefer
`NotRequired` for new optional keys). **Do not rename or remove** an existing
event type or payload key without a 2-minute KR↔RR sync and a `version` bump in
the `events.py` docstring and this doc's header.
