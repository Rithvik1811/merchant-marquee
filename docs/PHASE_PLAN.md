# ProductCut — Phase-by-Phase Build Plan

**Global AI Hackathon with Qwen Cloud — Track 2: AI Showrunner**
**Team size:** 2 · **Runway:** several days before deadline

> This document supersedes and expands **Section 8 (Build Priority Order)** of `PROJECT_PROPOSAL.md`, and now also reflects the two architectural extensions added to `TECHNICAL_DOCUMENTATION.md`: **script-driven direction** (Product Truth Extractor, Treatment Agent, justification-forced Shot-List, lightweight seller intake) and **chat-based post-generation revision** (Edit Router, Edit Interpreter, checkpoint-fork scoped re-execution). It is a build plan for the already-approved architecture — it does **not** redesign anything beyond what the technical doc specifies. If you need the "why" behind an agent or the system diagram, read the technical doc; if you need "who builds what, in what order, and how we know it's done," read this.

**Non-negotiable sequencing constraint:** Neither the Qwen/DashScope LLM calls nor the Wan/HappyHorse video-gen calls have been tested yet. **Video-gen quality is the single largest risk to the whole submission.** It must be de-risked (Phase 0) before any orchestration code is written. Everything else in this plan bends around that constraint.

**Scope philosophy for the two extensions.** The **script-driven direction** extension (Product Truth Extractor, Treatment Agent, justification-forced Shot-List, lightweight intake) is treated as **core** — it is cheap relative to the video-gen work, directly strengthens the Innovation criterion, and de-risks the single biggest qualitative complaint judges could make ("this just looks like generic AI ad output"). It is folded into Phases 1–2 below. The **chat-based revision** extension is treated as a **planned, fully-specified stretch phase (Phase 9)** — it depends on the entire core pipeline being stable and checkpointed first, and a 2-person team should not start it until Phases 0–7 are green. Both extensions are written up in full detail here regardless of final scope-cut decisions, so the team can pick up either one directly from this document without re-deriving the design.

**Judging weights (keep these in view when trading off scope):**
| Criterion | Weight | Phases that feed it most |
|---|---|---|
| Technical Depth & Engineering | 30% | Phases 2, 3, 4, 9 |
| Innovation & AI Creativity | 30% | Phases 1, 2, 4, 9 |
| Problem Value & Impact | 25% | Phases 3, 5 (finished usable video), 9 |
| Presentation & Documentation | 15% | Phases 6, 7, 8 |

---

## 1. Team Split Recommendation

Two people, two clean lanes. The split is drawn so that each person can work for long stretches without blocking on the other, with a small number of **explicit contract handshakes** where the two lanes must agree on an interface before either side builds against it.

### Person A — "Brain" (orchestration + AI logic + backend)
Owns the LangGraph graph, all agent nodes (including the Product Truth Extractor, Treatment Agent, and — in Phase 9 — the Edit Router/Edit Interpreter), every Qwen/DashScope call (LLM, vision, TTS), the Wan/HappyHorse video-gen orchestration, the budget/ledger logic, the DB writes, and the FastAPI backend including the WebSocket event emitter (`astream_events`).

**Rough domain:** `graph/`, `agents/`, `nodes/`, `backend/`, DB models, prompt templates, the deterministic validators (Pacing-Checker, Justification Validator).

### Person B — "Body" (frontend + media assembly + cloud)
Owns the Next.js/React/Tailwind frontend, the live WebSocket dashboard (budget ledger, critic reasoning trace, continuity drift scores, director's treatment panel), the ffmpeg assembly + multi-format export pipeline, all Alibaba Cloud plumbing (ECS instance, OSS bucket, managed Postgres/PolarDB, deployment, and the Proof-of-Deployment capture), and — in Phase 9 — the chat UI and the diff/preview panel.

**Rough domain:** `frontend/`, `assembly/` (ffmpeg), `infra/` / deployment scripts, cloud config.

> Note on ffmpeg ownership: assembly and export (Phase 5) are deterministic media plumbing, which fits Person B's media/cloud lane and keeps Person A focused on agent logic. Person A hands Person B a finalized shot-list + VO-timing JSON; Person B turns it into the stitched, captioned, multi-aspect video. This is a clean seam.

### The five contract handshakes (freeze these early, in writing, before parallel work)

These are the only places the two lanes hard-couple. Each must be a written, versioned artifact (a `.md` or a typed schema file both people import), agreed **before** the dependent work starts.

| # | Contract | Frozen by end of | Why it blocks both people |
|---|---|---|---|
| C1 | **LangGraph shared state schema** — the single state object every node reads/writes (job id, brief, photo refs, seller-direction, product truths, script variants, critic trace, winning script, treatment, shot list w/ justification, per-shot video/status, drift scores, budget ledger, VO/caption timing, final outputs, chat/edit fields). | Phase 0 | Person A builds nodes against it; Person B's dashboard renders slices of it. Renaming a field later breaks both sides. |
| C2 | **WebSocket event schema** — the envelope + event types streamed from `astream_events` to the dashboard (e.g. `node_started`, `truth_extracted`, `critic_score`, `treatment_ready`, `budget_updated`, `drift_scored`, `shot_generated`, `interrupt_requested`, `edit_routed`, `job_complete`). Every event: `{type, job_id, ts, payload}`. | Phase 0 | Person B builds the dashboard against this; Person A emits it. Must agree before either builds streaming. |
| C3 | **Shot-list JSON schema** — the camera-literate shot object, including the `justification` sub-object (see Phase 2). No `product_category` field exists anywhere in this schema — that omission is deliberate (Technical Doc §5.6) and must not be silently reintroduced. | End of Phase 2 (drafted in Phase 0) | Feeds Video-Gen (A), Continuity (A), and Assembly/Export (B). Must be frozen before Phase 3 fan-out and Phase 5 assembly start. |
| C4 | **Interrupt / human-review contract** — the payload of a LangGraph `interrupt()` (which shot, drift score, candidate frames, allowed responses: `approve` / `retry-with-edit` / `accept-fallback`) and the resume payload the frontend posts back. Reused verbatim by the Phase 9 Preview/Confirm gate with a different payload shape (diff + estimated cost instead of drift score + frames). | End of Phase 3 (drafted), finalized Phase 4 | Person A raises the interrupt; Person B renders the review UI and posts the resume. |
| C5 | **Edit-request / checkpoint-fork contract** (Phase 9 only) — the Edit Router's output schema (`scope`, `target_shot_ids`, `entry_node`, `confidence`), the Edit Interpreter's patch schema, and the fork-branch bookkeeping (`fork_branch_id`, `parent_branch_id`) both sides read to render the version tree. | Start of Phase 9 | Person A implements the router/interpreter/fork logic; Person B builds the chat UI, diff panel, and version picker against this contract. |

**Working agreement:** C1 and C2 are drafted and committed on Day 1 (Phase 0), including the new fields required by the script-driven-direction extension (seller_direction, product_truths, treatment, justification). They can be extended additively later (add fields, don't rename/remove) without a renegotiation. C5 is only drafted once Phase 9 actually starts. Any breaking change to a frozen contract requires a 2-minute sync and a version bump comment in the schema file.

---

## 2. Phases

Each phase lists: **Goal**, **Estimate**, **Person A tasks**, **Person B tasks**, **Dependencies/blockers**, **Exit criterion** (a demoable artifact or a passing check — never a vague "works").

Estimates assume two focused people. Treat them as relative sizing, not calendar promises.

---

### Phase 0 — De-risk & Environment Setup
**Goal:** Prove both external APIs actually work and produce acceptable output, and stand up the cloud + contracts, before a single line of orchestration is written.

**Estimate:** ~1 day (do not skip or rush — this is the whole-submission insurance policy).

**Person A tasks:**
- Get Qwen Cloud / DashScope credentials working. Make a **trivial** OpenAI-compatible chat call to Qwen-Max and print the response. Confirm the same endpoint pattern for Qwen-VL (vision) and Qwen TTS/CosyVoice with one-line smoke tests each. Record model IDs, base URL, and auth in a shared `.env.example` + notes.
- **The critical de-risk task:** get Wan/HappyHorse access and run a **raw quality test** — take 3-4 real test product photos and generate a handful of test shots using **image-to-video only** (product photo as conditioning reference; **never** pure text-to-video). Try 2-3 camera moves (push_in, orbit, static) and a couple of prompt styles. Save the outputs. **Judge honestly: is this quality good enough to ship a demo?** Note latency per shot and failure behavior (what a hard API failure looks like — this informs the Ken-Burns fallback in Phase 3).
- Also run a **one-off manual test of the Product Truth Extractor prompt** (single Qwen-VL call against the same test photos): does it actually return specific, checkable facts, or generic ones? This is a cheap 15-minute check that de-risks Phase 1's new agent before it's wired into the graph.
- Draft **C1 (LangGraph state schema — including `seller_direction`, `product_truths[]`, `treatment`, and the `justification` sub-object)** and **C3 (shot-list schema, first cut)** as committed schema files.
- Scaffold the FastAPI app + a bare LangGraph graph with one no-op node that streams a test event via `astream_events`. Add the `langgraph-checkpoint-postgres` dependency now (even though it's only exercised for real in Phase 9) so the checkpoint tables exist in the DB from day one — this avoids a schema-migration scramble later.

**Person B tasks:**
- Provision Alibaba Cloud: spin up the **ECS instance** (chosen over Function Compute because of long-lived WebSocket connections + multi-minute graph runs), create the **OSS bucket**, and create the **managed Postgres-compatible DB** (PolarDB/RDS). Capture credentials into the shared secrets store / `.env`.
- Confirm connectivity from the ECS box: can reach OSS (upload+download a test file), can connect to the DB (create a test table), can reach the DashScope + Wan endpoints from inside Alibaba Cloud's network (latency + firewall/egress sanity check).
- Scaffold the Next.js/React/Tailwind app; stand up a WebSocket client that connects to Person A's no-op streaming endpoint and logs received events.
- Co-author **C2 (WebSocket event schema)** with Person A and commit it.
- Sketch the **optional seller-intake form** (mood words, reference-ad link/description, "never do this," freeform) as a collapsible/optional section on the submission form — pure UI, no backend dependency yet.

**Dependencies/blockers:**
- Hard blocker on external API access (Qwen keys, Wan/HappyHorse access). If either is delayed, escalate immediately — everything downstream waits on this.
- C1 and C2 must be committed before Phase 1 (A) and Phase 6 (B) can build against them.

**Exit criterion (all must be true):**
1. A saved folder of **real Wan/HappyHorse test shots** generated from product photos, with a written go/no-go quality verdict. (If "no-go," stop and address prompt strategy / provider settings before proceeding — this is the moment to find out.)
2. Trivial Qwen-Max, Qwen-VL, and Qwen-TTS calls each return a valid response, logged.
3. A one-off Product Truth Extractor prompt test returns at least 4 specific, non-generic facts from real test photos (manual eyeball check, not yet wired into the graph).
4. ECS reachable; OSS round-trip file upload/download succeeds; DB accepts a test write; checkpoint tables exist (empty is fine).
5. Frontend receives and logs a test event over WebSocket from the FastAPI `astream_events` stream.
6. `C1`, `C2`, and a first-draft `C3` are committed to the repo, with C1 already including the `seller_direction` / `product_truths` / `treatment` / `justification` fields (even if unused until Phase 1–2).

---

### Phase 1 — Intake + Product Truth Extractor + Concept Agent + Critic Chain
**Goal:** Produce a scored, cross-pollinated winning script that is grounded in specific product facts (not generic category assumptions), with a visible reasoning trace, entirely in text, with zero video-gen dependency.

**Estimate:** ~1.5 days. (Cheap to build, high leverage — directly hits the 30% Innovation criterion, and this is where the "script-driven, not category-driven" story starts.)

**Person A tasks:**
- **Ingest extension:** wire the optional `seller_direction` fields (mood words, reference ad, never-do, freeform) from Person B's form into the `jobs`/`seller_direction` tables and into C1 state. All fields nullable — a submission with none of them must work identically to today.
- **Product Truth Extractor (Qwen-VL, new):** one call against the 2-3 product photos (+ `seller_direction.freeform` if present) producing `product_truths[]` — 6-10 specific, checkable facts, each carrying a `truth_id` and `category`. Add the cheap heuristic reject-and-reprompt for generic-sounding facts (under ~6 words, or matching a generic-adjective stoplist).
- **Concept Agent (Qwen-Max):** one structured-output call producing **4 script variants**, each forced into a **distinct ad framework** (Hook-Problem-Product-CTA / PAS / AIDA / BAB), a **distinct hook type**, and a **distinct emotional trigger**, each with **beat-level timestamps**, a **single CTA**, and — new — at least **2 `grounding_truth_ids`** citing real entries from `product_truths[]`. If `seller_direction` is set, mood words bias framework/tone choice.
- **Critic Chain — 4 parallel specialist checkers:**
  - Hook-Checker (Qwen)
  - Pacing-Checker (**deterministic math** on beat timestamps vs. target 15-30s window — not an LLM call)
  - CTA-Checker (Qwen)
  - Tone-Checker (Qwen) — now also hard-fails any variant that violates `seller_direction.never_do`, if set.
- **Meta-Critic:** computes the weighted composite score — **hook 25%, pacing 20%, completion 20%, CTA 20%, tone 15%** — excludes any `never_do_violation` variant before weighting, and **cross-pollinates the best hook + body + CTA across variants into one winning script**, emitting a full **reasoning/scoring trace** (per-variant scores + justification + what got merged from where).
- Wire these as LangGraph nodes writing into the C1 state; emit `truth_extracted` / `critic_score` / trace events per C2 so the dashboard can later render them.

**Person B tasks:**
- Wire the optional intake form (sketched in Phase 0) to the real ingest endpoint.
- Build the static shell of the dashboard: layout, a panel rendering `product_truths[]` as a simple list (proof that grounding is real, not hidden), and the panel that will render the **critic reasoning trace** and the per-variant score table. Drive it off recorded/mock C2 events from Phase 0 (no live backend dependency yet).
- Build a minimal job-submission form (photos + one-line brief + optional intake) posting to the backend ingest endpoint stub.

**Dependencies/blockers:**
- Depends on C1 + C2 (Phase 0). No dependency on video-gen — this is deliberately front-loaded because it's cheap and demo-valuable.

**Exit criterion:**
- Feeding a real one-line brief (with and without optional intake filled in) through Ingest → Truth Extractor → Concept → Critic Chain returns **6+ specific product truths**, **4 valid script variants each citing real truth IDs**, and **one merged winning script** with a **human-readable scoring trace** showing the weighted composite and which elements were cross-pollinated. Verified from a script/CLI run and visible in the dashboard trace panel (even if fed by captured events at this stage). Manually confirm at least one script would read as noticeably different if fed a *different* product's photos with the same brief — that's the concrete test that grounding is doing real work.

---

### Phase 2 — Treatment Agent + Justification-Forced Shot-List + Budget Gate + Ledger
**Goal:** Turn the winning script into a camera-literate, budget-capped shot list whose every camera/composition choice is justified by the specific script and product facts — not by a category lookup — and persist it all to the ledger DB.

**Estimate:** ~1.5 days. (Directly hits the 30% Technical Depth criterion and the 30% Innovation criterion simultaneously — this phase is the mechanical core of "script-driven direction.")

**Person A tasks:**
- **Treatment Agent (Qwen, new):** one call over the winning script + `product_truths[]` + `seller_direction` producing a `treatment` object: `director_persona`, `color_story`, `pacing_philosophy`, and a `beat_treatments[]` array where each entry has a verbatim `script_quote`, a real `truth_fact_id`, a `visual_approach`, and a `why_not_generic` explanation. Prompt-level guard: the word "category" and category names are disallowed in the output.
- **Shot-List Agent (Qwen):** break the winning script + treatment into **3-7 shots** using the camera-literate schema. Freeze **C3** here. Each shot object contains the existing fields (`shot_id`, `shot_type`, `camera_move`, `framing`, `lighting_style`, `negative_prompt`, `reference_image_id`, `text_overlay_zone`, `duration_sec`, `allocated_budget`, `voiceover_line`) **plus the new `justification` object**: `{ script_quote, truth_fact_id, treatment_ref }`. Confirm there is **no `product_category` field anywhere** in the schema — that omission is intentional.
- **Justification Validator (deterministic, new):** a pure-code check run immediately after the Shot-List Agent call and before the Budget Gate: (1) `script_quote` is a verbatim/fuzzy substring of the winning script text, (2) `truth_fact_id` exists in `product_truths[]`, (3) `treatment_ref` matches a real `beat_treatments[]` entry, (4) reject shots whose justification matches a generic-phrase stoplist. One re-prompt on failure, naming the exact violating shot/field; on a second failure, fall back to the treatment's literal `visual_approach` for that beat.
- **Budget Gate (deterministic):** hard-cap check on summed `allocated_budget`, run only after the Justification Validator passes every shot. If over cap, **one loop-back** to the Shot-List Agent to re-allocate; on the second pass, enforce. Write every allocation/decision to the **Budget Ledger** table in the managed DB.
- Emit `treatment_ready` / `budget_updated` events per C2.

**Person B tasks:**
- Build the **director's treatment panel** in the dashboard (persona, color story, pacing philosophy, and the per-beat justification list) — this is a strong, cheap demo visual for the Innovation criterion.
- Build the **live budget ledger panel** in the dashboard (per-shot allocations, running total, cap line, over/under state), fed by `budget_updated` events. Add a per-shot **justification tooltip/expand** (script quote + truth fact) next to each shot card.
- Finalize the DB schema/migrations for the ledger + treatment + shot-list-with-justification records on the managed Alibaba Cloud DB (co-owned with A; B owns the cloud DB plumbing, A owns the write logic).

**Dependencies/blockers:**
- Depends on Phase 1 (winning script + product truths) and C3. **C3 must be frozen at the end of this phase** — Phases 3 (Video-Gen, Continuity) and 5 (Assembly) all consume it.

**Exit criterion:**
- A winning script produces a valid **3-7 shot list** conforming to the frozen C3 schema, with a shared lighting string sourced from the treatment, per-shot budgets that **sum within the hard cap** (demonstrably triggering the one loop-back when seeded over budget), **every shot's `justification` passing the deterministic validator** (demonstrably triggering the one re-prompt when a justification is seeded as generic/ungrounded), and **ledger + treatment + shot rows visible in the DB** and in the dashboard budget/treatment panels.

---

### Phase 3 — Video-Gen Node + Graceful Degradation
**Goal:** Generate every shot in parallel from its structured prompt + reference photo, with a hard-failure path that never blocks the pipeline.

**Estimate:** ~1.5 days. (Highest-effort core component; its output quality was already de-risked in Phase 0.)

**Person A tasks:**
- **Video-Gen Node:** LangGraph **parallel fan-out** over shots using `Send()`. For each shot, call Wan/HappyHorse with:
  - the **structured prompt formula**: `Subject -> Action -> Camera -> Lighting -> Composition -> Mood -> Quality`
  - the shot's `negative_prompt`
  - the **reference product photo** as conditioning (image-to-video only — never text-to-video)
- **Ken-Burns Fallback Node:** on a **hard API failure**, route **straight** to the fallback (a static Ken-Burns pan/zoom on the reference product photo) — **no retry consumed** (retries are reserved for continuity drift in Phase 4, not for API failures here).
- Upload generated shot assets to **OSS**; record status per shot in state; emit `shot_generated` events (including whether a shot is real or fallback) per C2.

**Person B tasks:**
- Dashboard: **per-shot generation status grid** (queued / generating / done / fallback), rendering `shot_generated` events, with thumbnail/preview pulled from OSS.
- Verify OSS read access from the frontend (signed URLs or backend proxy) for previewing generated shots.

**Dependencies/blockers:**
- Depends on frozen C3 (Phase 2) and the Phase 0 video-gen de-risk. This is where the Phase 0 quality verdict pays off — if Phase 0 was "no-go," do not arrive here.

**Exit criterion:**
- A full shot list fans out and returns a **generated video clip per shot in OSS**, with the fan-out visibly parallel. **Deliberately killing/faking one shot's API call routes that shot to a Ken-Burns fallback clip without consuming a retry and without blocking the others.** All shot statuses render live in the dashboard grid.

---

### Phase 4 — Continuity Agent + Human-in-the-Loop Review
**Goal:** Catch visual drift per shot, auto-retry within a hard cap, and escalate to a real human-review interrupt when retries are exhausted.

**Estimate:** ~1.5 days.

**Person A tasks:**
- **Continuity Agent (Qwen-VL):** per shot, compare a generated frame against the **reference product photo** and the **shared lighting/style string**, returning a **drift/consistency score**.
- **Capped retry loop:** if drift exceeds threshold and **retries < 2**, loop back to the Video-Gen Node for that shot (this is the *only* place retries are consumed — API failures in Phase 3 do not consume them). **Hard-cap at 2 retries** to protect the token budget.
- **Human-in-the-loop:** when retries are exhausted, raise a **real LangGraph `interrupt()`** carrying the C4 payload (shot, drift score, candidate frames, allowed responses). On resume, apply the human's choice: `approve` / `retry-with-edit` / `accept-fallback`, then continue the graph.
- Emit `drift_scored` and `interrupt_requested` events per C2.

**Person B tasks:**
- Build the **human-review UI** in the seller frontend: surface the interrupt (shot + drift score + candidate frames from OSS), offer the three actions, and **post the resume payload** back to the backend (per C4).
- Dashboard: **continuity drift-score panel** per shot, live via `drift_scored`.

**Dependencies/blockers:**
- Depends on Phase 3 (need generated shots to check) and C4 (drafted end of Phase 3, finalized here).

**Scope-cut fallback (explicitly allowed):** If time is short, degrade to **"flag only, no auto-retry"** — the Continuity Agent scores and flags drift for the user but does not loop back or interrupt. This mirrors the original proposal's allowed simplification and keeps a working demo. Decide this by the start of Phase 4, not mid-build.

**Exit criterion:**
- A shot that drifts past threshold **triggers up to 2 automatic re-generations**; a shot that still fails **raises a real `interrupt()`** that pauses the graph, surfaces in the seller UI, and **resumes correctly** on each of the three human choices. Drift scores stream live to the dashboard. (Or, if the fallback was taken: drift is scored and flagged in the UI, documented as a deliberate scope cut.)

---

### Phase 5 — Voiceover/Captions + Assembly + Multi-Format Export
**Goal:** Produce a finished, captioned, voiced ad video exported in all three aspect ratios from the same generated shots.

**Estimate:** ~1.5 days.

**Person A tasks:**
- **Voiceover + Caption Agent (Qwen TTS / CosyVoice):** a **parallel branch** that starts once the script is finalized (does not wait on video-gen). Produce **VO audio** and **caption timing synced to the script beats**. Hand Person B a finalized VO-audio asset (in OSS) + caption/timing JSON.

**Person B tasks:**
- **Assembly Agent (ffmpeg, deterministic):** stitch approved shots + VO audio + **burned-in captions/CTA text in the reserved `text_overlay_zone`** + transitions/music timing. (Captions/CTA are burned in here at post — never generated by the video model.)
- **Format Export Node (ffmpeg, deterministic):** recompose the same generated shots into **9:16, 1:1, and 16:9**.
- Upload final videos to OSS; surface them for download/preview in the frontend.

**Dependencies/blockers:**
- Assembly depends on Phase 3/4 (approved shots) and C3's `text_overlay_zone` + `duration_sec`. VO branch depends only on the finalized script (Phase 1), so Person A can start it as early as Phase 1 output is stable and run it in parallel.

**Exit criterion:**
- A run produces a single **finished 15-30s ad video** with synced voiceover and burned-in captions/CTA in the reserved zones, **exported in all three aspect ratios (9:16 / 1:1 / 16:9)** from the same shots, all downloadable from OSS via the frontend.

---

### Phase 6 — Frontend Dashboard + Realtime Streaming
**Goal:** A single live dashboard that streams the whole run — product truths, director's treatment, budget ledger, critic reasoning trace, and continuity drift scores — as it happens.

**Estimate:** ~1 day (largely integration of panels built incrementally in Phases 1-5).

**Person A tasks:**
- Ensure the FastAPI backend emits the **complete C2 event stream** from LangGraph's `astream_events` for a full end-to-end run (every node transition, truth extraction, treatment, score, budget update, drift score, shot status, interrupt). Fix any gaps found when the dashboard consumes a real run.

**Person B tasks:**
- Assemble the panels from prior phases into one coherent **live dashboard**: job progress, live **product truths** panel, live **director's treatment** panel, live **budget ledger**, live **critic reasoning trace**, live **continuity drift scores**, per-shot status with **justification** shown per shot, human-review surfacing, and final video previews.
- Consume `astream_events` over WebSocket end-to-end (replace any remaining mock feeds with the live stream). Handle reconnect + late-join (render current state on connect).

**Dependencies/blockers:**
- Depends on all prior phases emitting their C2 events. This phase is mostly wiring the real stream into already-built panels.

**Exit criterion:**
- Kicking off a real job from the frontend drives the **entire dashboard live from `astream_events`** — a viewer watching the dashboard can follow the run from ingest to final export (truths appearing, treatment appearing, budget filling in, critic trace appearing, shots generating with visible justifications, drift scoring, final videos) without a page refresh.

---

### Phase 7 — Deployment + Alibaba Cloud Proof
**Goal:** The whole system runs on Alibaba Cloud and we have the recorded proof the hackathon requires.

**Estimate:** ~1 day. (Budget generously — deployment friction under time pressure is a known risk.)

**Person A tasks:**
- Ensure the backend runs cleanly in the deployed ECS environment (env config, process management, WebSocket stays up across a multi-minute graph run). Confirm all DashScope + Wan calls work from inside Alibaba Cloud. Confirm the LangGraph checkpoint tables are reachable and writable in the deployed DB (needed even before Phase 9 ships, since checkpointing already backs crash-resume).

**Person B tasks:**
- **Deploy the FastAPI backend to ECS**; deploy/serve the Next.js frontend; wire **OSS** and the **managed DB** in the deployed environment (not just locally).
- Capture the **Proof of Deployment**: a recorded clip **plus a linked code file** showing **actual Alibaba Cloud service/API calls** (OSS upload, DB write, running on ECS) — not merely referenced, actually executed. This is a hard submission requirement.

**Dependencies/blockers:**
- Depends on a working end-to-end run (Phases 1-6). Do not leave deployment to the final day — network/egress/firewall surprises live here.

**Exit criterion:**
- A **full job runs end-to-end on the deployed Alibaba Cloud stack** (ECS backend + OSS + managed DB), and the **Proof-of-Deployment recording + linked code file** are captured and saved, clearly showing live Alibaba Cloud service calls.

---

### Phase 8 — Polish, Demo Prep, Stretch Features
**Goal:** Lock a reliable, judge-ready submission and add stretch value only if genuinely ahead.

**Estimate:** ~1 day (+ buffer).

**Person A tasks:**
- **Demo safety net:** build a **pre-warmed cache / replay** path — a known-good job whose outputs are cached so demo day never depends on a live cold Wan/HappyHorse call. This is the single most important demo-day insurance item.
- **Stretch features, only if ahead of schedule (see Phase 9 for the largest stretch item):**
  - **A/B hook-variant export** — same body, two different hooks, two exports.
  - **Dynamic mid-pipeline budget renegotiation.**
  - (Explicitly **cut from scope:** cross-session brand-style memory. Do not build it.)

**Person B tasks:**
- Export the **architecture diagram** as an image for the submission page (from the technical doc's Mermaid diagram).
- Record the **~3-minute demo video** walking the agent handoffs, the product-truths/treatment panels, the critic trace, the budget dashboard, continuity/human-review, and the multi-aspect finished video. Upload publicly.
- Final **documentation pass**: README, feature description, license visible in the repo About section, track clearly identified.

**Dependencies/blockers:**
- Stretch features depend on everything core being done and stable. **If core isn't rock-solid, skip stretch entirely** — a polished core demo beats a fragile feature-rich one. This explicitly includes Phase 9 — do not start it if Phases 0-7 are not green.

**Exit criterion:**
- The **Definition of Done checklist (Section 4) is fully green**, a **replay/cache path guarantees a working demo** independent of live API latency, and the ~3-min demo video + architecture diagram are finalized and uploaded.

---

### Phase 9 — Chat-Based Post-Generation Revision *(stretch, fully specified)*
**Goal:** Let the seller converse in natural language about a finished ad and get a **targeted, cost-scoped fix** — not a full pipeline re-run — for the most common revision requests (hook tone, single-shot visual complaint, pacing/length, CTA text, and genuinely global "more energetic" asks).

**Estimate:** ~2 days. **Only start this phase if Phases 0-7 are fully green and stable** (per the Phase 8 gating note). This is the largest single stretch item in the plan and is explicitly optional for submission, but is written up in full here so the team can execute it directly without re-deriving the design if time allows.

**Person A tasks:**
- **Edit Router (Qwen, new):** a classification call taking the chat message + full job state, returning `{scope, target_shot_ids[], entry_node, confidence, rationale}` per the routing table in the technical doc (§5.16.1): copy/tone complaints route to `concept`; a single-shot visual complaint routes to `shot_list` scoped to that shot; pacing/length routes to `shot_list` (Assembly/Export only, skip Video-Gen if trimming suffices); CTA-text-only routes straight to `assembly` (zero LLM/video-gen calls beyond the router); a genuinely global ask ("more energetic") routes through a Treatment re-seed and touches every shot. Below a confidence threshold, do not guess — surface a clarifying question in chat instead.
- **Edit Interpreter (Qwen, new):** given the router's output, produce a grounded patch object (`treatment_patch`, `shot_patches[]`, `justification`) that translates a vague ask into specific parameter deltas — e.g. "more energetic" becomes a specific new `director_persona` plus concrete duration/camera-move changes on the affected shots. Route every patch through the **same Justification Validator from Phase 2** before it's accepted — an edit patch is not exempt from grounding requirements.
- **Checkpoint-fork mechanism:** implement `get_state_history(thread_id)` lookup by `entry_node`, `update_state(checkpoint_id, patch)`, and `graph.invoke(None, {"configurable": {"thread_id": new_branch_id}})` to fork a new execution branch from the chosen checkpoint with the patched state. Confirm untouched shots' `generated_shots[]` entries are copied by reference (no re-upload, no re-render) into the new branch.
- Emit `edit_routed` / `edit_patch_ready` / `fork_created` events per C5/C2.

**Person B tasks:**
- **Chat UI:** a simple message thread attached to a completed job, posting to the Edit Router endpoint.
- **Preview/Confirm diff panel:** reusing the `interrupt()` UI pattern from Phase 4 (C4), render old-vs-new script/shot-list/treatment fields for every affected shot, plus an **estimated incremental cost** (shots that will actually re-render × per-shot cost from the ledger). Require an explicit confirm before the backend proceeds to Video-Gen.
- **Version picker:** a simple list/tree UI reading `job_versions` (branch_id, parent_branch_id, summary) so the seller can see and revert to prior versions.

**Dependencies/blockers:**
- Depends on the entire core pipeline (Phases 1-7) being stable, on the LangGraph checkpointer already being wired to Postgres (seeded in Phase 0, exercised for real here), and on C5 being drafted before work starts.
- **This phase must not weaken any existing guarantee.** A chat-edit re-render failure reuses the exact same fallback/retry/interrupt machinery as a first-pass run (Phases 3-4) — no separate error path is introduced.

**Exit criterion:**
- Sending each of the five example messages from the technical doc's routing table ("make the hook punchier," "shot 2 is too dark," "shorten it to 15s," "change the CTA text," "make it more energetic") against a completed demo job produces the **correct `entry_node` routing**, a **grounded patch that passes the Justification Validator**, a **diff/cost preview requiring confirmation**, and — on confirm — a **new version that only re-rendered the shots actually affected** (verified by comparing `generated_assets` rows/OSS object timestamps between the old and new version — untouched shots must be identical references, not new renders).

---

## 3. Risk Register

| Risk | Impact | Mitigation | Addressed in |
|---|---|---|---|
| **Wan/HappyHorse output quality is poor** — the single largest risk; no orchestration cleverness saves a bad-looking demo. | Fatal to the whole submission. | De-risk **first**, before any orchestration code: raw quality test on real product photos with a hard go/no-go verdict. Use image-to-video with reference-photo conditioning only. Ken-Burns fallback guarantees *some* usable output per shot. | **Phase 0** (verdict), Phase 3 (fallback) |
| **Product Truth Extractor or Treatment Agent produces generic output anyway**, defeating the point of the extension. | Wastes two new agent calls without the intended quality gain; script/shot-list revert to feeling generic. | Cheap heuristic reject-and-reprompt on generic-sounding facts/justifications (Phase 1, Phase 2); the deterministic **Justification Validator** is the hard backstop — it mechanically checks quote/fact citations rather than trusting the model's self-report. | **Phase 1** (truths), **Phase 2** (validator) |
| **Continuity retry loop eats the entire token/video budget.** | Runaway cost, stalled or failed runs. | Hard-cap retries at **2**, consumed **only** by continuity drift (API failures use the no-retry Ken-Burns path). Retries exhausted -> human interrupt, not infinite loop. Optional degrade to "flag only." | **Phase 4** (cap + interrupt); Phase 3 (no-retry failure path) |
| **WebSocket / LangGraph `astream_events` streaming integration is complex** and couples both people. | Dashboard shows nothing; late integration crunch. | Freeze the **C2 event schema on Day 1**; Person B builds panels against captured/mock events from Phase 0; wire the live stream incrementally each phase so Phase 6 is assembly, not first contact. Handle reconnect/late-join. | **Phase 0** (schema), Phases 1-5 (incremental), **Phase 6** (full stream) |
| **Alibaba Cloud deployment friction under time pressure** (egress/firewall, WebSocket longevity, managed-DB/OSS wiring). | Missed Proof-of-Deployment requirement = disqualified from a core criterion. | Provision ECS/OSS/DB and verify connectivity **in Phase 0**, not at the end. Chose ECS over Function Compute deliberately for long-lived WS + multi-minute runs. Budget a generous, non-final-day deployment window. | **Phase 0** (provision + verify), **Phase 7** (deploy + proof) |
| **Demo-day live API flakiness / latency** (cold Wan calls mid-presentation). | Live demo stalls or fails in front of judges. | Pre-warmed **cache/replay** of a known-good job so the demo never depends on a live cold generation. | **Phase 8** |
| **Scope creep on a 2-person team.** | Core ships late or unpolished. | Stretch features (A/B hooks, dynamic renegotiation, and **Phase 9 chat revision in full**) are strictly "only if ahead," with Phase 9 explicitly gated behind all of Phases 0-7 being green. Cross-session brand memory is **cut**. Continuity has a pre-agreed "flag only" degrade. | Phases 4, 8 & 9 |
| **Chat-edit misrouting** (Phase 9) causes an unintended, expensive re-render. | Wasted video-gen spend, seller confusion. | Edit Router refuses to guess below a confidence threshold (asks a clarifying question instead); Preview/Confirm gate requires explicit seller approval **before** any Video-Gen call, with an estimated cost shown. | **Phase 9** |

---

## 4. Definition of Done (whole-project readiness checklist)

Self-check against the hackathon submission requirements before the deadline. Every box must be green.

**Submission requirements (hard):**
- [ ] Public GitHub repo, with an **open-source license visible in the About section**.
- [ ] **Proof of Alibaba Cloud deployment:** recorded clip **+ linked code file** showing **actual** Alibaba Cloud service/API calls (ECS running the backend, OSS upload/download, managed-DB write) — executed, not merely mentioned.
- [ ] **Architecture diagram** exported as an image for the submission page.
- [ ] **~3-minute demo video** uploaded publicly (YouTube/Vimeo/Facebook).
- [ ] **Text description** of features/functionality.
- [ ] **Track identified: Track 2 — AI Showrunner.**
- [ ] (Optional) Blog post documenting the build journey (Blog Post Prize eligibility).

**Core functionality proven end-to-end (must ship):**
- [ ] Seller can submit **2-3 product photos + a one-line brief** (with an optional lightweight creative intake) and receive a finished ad video.
- [ ] **Product Truth Extractor** returns 6+ specific, checkable product facts consumed by the Concept and Treatment Agents.
- [ ] Concept Agent produces **4 framework-distinct script variants**, each grounded in real product truths; Critic Chain (4 checkers + Meta-Critic) produces a **weighted score + cross-pollinated winning script + visible reasoning trace**.
- [ ] **Treatment Agent** produces a director's-treatment-style document (persona, color story, pacing philosophy, per-beat justification) grounded in the winning script and product truths.
- [ ] Shot-List Agent produces a **camera-literate 3-7 shot list** (frozen C3 schema) with a **`justification` per shot that passes the deterministic Justification Validator**; Budget Gate enforces the **hard cap with one loop-back**; ledger persists to the managed DB.
- [ ] Video-Gen **parallel fan-out** generates a clip per shot from reference-photo conditioning; **Ken-Burns fallback** handles hard failures without consuming a retry.
- [ ] Continuity Agent scores drift, **auto-retries (cap 2)**, and escalates to a **real `interrupt()` human review** on exhaustion (or the documented "flag-only" degrade).
- [ ] Voiceover + synced captions produced; Assembly stitches VO + burned-in captions/CTA in reserved zones; **multi-aspect export (9:16 / 1:1 / 16:9)** from the same shots.
- [ ] **Live dashboard** streams product truths + treatment + budget ledger + critic trace + drift scores from `astream_events` for a full run.
- [ ] The whole pipeline **runs on the deployed Alibaba Cloud stack**, not just locally.

**Demo-day insurance:**
- [ ] **Pre-warmed cache/replay** path guarantees a working demo independent of live API latency.
- [ ] Demo video walks the agent handoffs, product-truths/treatment panels, critic trace, budget dashboard, continuity/human-review, and the finished multi-aspect video.

**Stretch (only if all of the above is green and stable):**
- [ ] **Phase 9: Chat-based revision** — Edit Router + Edit Interpreter + checkpoint-fork scoped re-execution + Preview/Confirm gate, demonstrated on at least the five canonical edit requests.
- [ ] A/B hook-variant export (same body, two hooks).
- [ ] Dynamic mid-pipeline budget renegotiation.
- [ ] ~~Cross-session brand-style memory~~ — **explicitly cut, do not build.**
