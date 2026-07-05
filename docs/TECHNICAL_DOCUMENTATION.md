# ProductCut — Technical Documentation

### Global AI Hackathon with Qwen Cloud — Track 2: AI Showrunner

> **Document status.** This is the authoritative technical specification for ProductCut. It supersedes Section 3 (System Architecture) and Section 4 (Agent Roster) of `PROJECT_PROPOSAL.md`. Where the proposal and this document disagree, this document wins. The problem statement and motivation framing carried forward from the proposal remain valid.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Why This Architecture](#2-why-this-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Agentic Architecture Diagram](#4-agentic-architecture-diagram)
5. [Agent-by-Agent Detail](#5-agent-by-agent-detail)
6. [Shared State Schema](#6-shared-state-schema)
7. [Database Design](#7-database-design)
8. [Error Handling & Graceful Degradation](#8-error-handling--graceful-degradation)
9. [Deployment on Alibaba Cloud](#9-deployment-on-alibaba-cloud)
10. [Judging Criteria Alignment](#10-judging-criteria-alignment)

---

## 1. Project Overview

### 1.1 The Problem

Small Etsy and Shopify sellers cannot afford professional product video ads. A single 15–30 second ad video from a freelance studio costs $300–$1,500 and takes days to turn around. Most sellers default to posting static photos instead, which convert worse than video across every major ad platform. The gap between "has product photos" and "has a scroll-stopping short-form video ad" is exactly the gap that keeps small sellers from competing for paid attention.

**ProductCut** closes that gap. A seller uploads 2–3 product photos and a one-line creative brief — for example, *"handmade ceramic mugs, cozy autumn vibe"* — and receives a finished 15–30 second product ad video, generated end-to-end by a coordinated crew of LLM agents running on Qwen Cloud.

This is deliberately **not** a general-purpose "type an idea, get any video" tool. The scope is intentionally narrow: **short-form product ad video for e-commerce sellers**. Narrow scope is what makes the agent pipeline's decisions — script selection, shot budgeting, visual consistency — meaningfully checkable, defensible, and demoable within a hackathon timeframe. A narrow domain also lets each agent encode real domain expertise (ad copywriting frameworks, camera grammar, pacing rules) instead of generic prompting.

### 1.2 Fit with Track 2 — AI Showrunner

Track 2 asks for an autonomous system that handles the full creative production chain — scriptwriting, storyboarding, video generation, and editing — while demonstrating narrative ability, multimodal orchestration, and quality maximization under a constrained budget. ProductCut maps directly onto every one of those requirements:

| Track 2 requirement | How ProductCut addresses it |
|---|---|
| Autonomously handle scriptwriting → storyboarding → video generation → editing | Concept Agent → Critic Chain → Shot-List Agent → Video-Gen → Continuity → Assembly → Format Export, orchestrated as a single LangGraph graph |
| Demonstrate narrative ability | The Concept Agent produces four structurally distinct scripts, each using a different copywriting framework, hook type, and emotional trigger; the Critic Chain scores and cross-pollinates them into one winning narrative |
| Multimodal orchestration | Text (brief → script) → image (product photos, reference frames) → video (Wan/HappyHorse) → speech (Qwen TTS) → final assembled cut |
| Maximize output quality under a limited budget | An explicit per-shot cost budget is enforced by a deterministic Budget Gate with a hard cap, streamed live to a cost dashboard, with graceful degradation (Ken-Burns fallback) when a shot cannot be generated |
| Agent negotiation / disagreement resolution the track wants judges to see | The Critic Chain runs four parallel specialist checkers whose scores are reconciled by a Meta-Critic that cross-pollinates the best hook, body, and CTA across variants — a visible, auditable negotiation, not a black box |

### 1.3 What the System Produces

For each job, ProductCut outputs a finished short-form product ad in **three aspect ratios** — 9:16 (TikTok / Reels / Shorts), 1:1 (feed), and 16:9 (YouTube) — plus a full transparency breakdown: the four candidate scripts, every critic score, the merge justification, the per-shot budget ledger, and the continuity drift scores. The transparency breakdown is a first-class deliverable, not a debug artifact: it is what makes the system's autonomous creative decisions legible to a judge (and, in production, to a seller who wants to understand why the system made the choices it made).

---

## 2. Why This Architecture

### 2.1 The Pipeline Is a Budget-Capped DAG, Not a Conversation

The core architectural decision is the choice of orchestration framework. ProductCut's pipeline is **not** a free-form multi-agent conversation. It is a directed acyclic graph (DAG) with five specific structural properties that the framework must model natively:

1. **A conditional retry loop.** The Continuity Agent can send a shot back to the Video-Gen Node for re-generation, but only up to a hard cap of 2 retries, after which it escalates to human review.
2. **A scoring / merge step with a visible reasoning trace.** The Critic Chain must produce an auditable record of how four candidate scripts were scored and merged into one — this trace is a demo deliverable, not an implementation detail.
3. **Per-step budget / cost tracking with hard caps.** Every node that spends money (video generation especially) must debit a shared ledger, and a gate must be able to reject a plan that exceeds the cap.
4. **Parallel fan-out.** Multiple shots generate concurrently, then rejoin for assembly.
5. **Realtime progress streaming to a frontend.** The budget ledger, critic reasoning, and drift scores stream live to the dashboard while the graph runs.

### 2.2 Framework Selection: LangGraph

**LangGraph was chosen** over CrewAI, Qwen-Agent, AutoGen/AG2, the OpenAI Agents SDK, LlamaIndex Workflows, and Temporal. It models all five of the properties above as first-class primitives:

- **Conditional retry loop** → LangGraph **conditional edges**, with the retry cap living in **typed graph state** (`retry_count` per shot). The loop condition is a pure function of state, so it is inspectable and bounded by construction.
- **Fan-out / fan-in** → LangGraph's **`Send()`** primitive dispatches one Video-Gen task per shot in parallel, and the graph rejoins them at the Assembly node.
- **Budget ledger** → a plain field on shared state (`budget_ledger`) that every node updates; the Budget Gate is a deterministic conditional edge reading that field.
- **Human-in-the-loop** → LangGraph's **`interrupt()`** provides a genuine pause/resume, not a dead-end flag. The graph checkpoints, surfaces the flagged shot in the UI, and resumes from the checkpoint once the seller responds.
- **Realtime streaming** → LangGraph's **`astream_events`** emits per-node events that a FastAPI WebSocket endpoint forwards to the frontend.

Critically, **all model calls route through Qwen via DashScope's OpenAI-compatible endpoint**, so Qwen usage is deep and visible in every node's trace *regardless of the orchestration framework*. Choosing LangGraph for orchestration does not dilute the "native Qwen Cloud usage" story for judging — every reasoning, vision, and speech call is a Qwen Cloud call, and the LangGraph trace makes each one visible.

### 2.3 Why Not the Alternatives

- **LlamaIndex Workflows** was the **second choice**. It offers a similar event-driven fit (event-emitting steps map cleanly onto our streaming needs), but its human-in-the-loop story is less turnkey than LangGraph's `interrupt()` + checkpointer.
- **CrewAI, AutoGen/AG2, and Qwen-Agent** were rejected as *primary orchestrators* because they model **conversational, role-based delegation** — agents talking to agents — rather than a budget-capped DAG with parallel fan-out and a conditional, count-limited retry loop. Forcing our pipeline into a conversation abstraction would mean hand-rolling the graph, the budget gate, and the retry cap on top of a framework that fights that shape.
  - **Qwen-Agent specifically lacks a graph/edge primitive**, so building the retry loop and fan-out would mean writing the pipeline control flow by hand. It remains, however, an excellent reference for **tool-calling patterns** if we need them inside any single node — we treat it as a source of component-level patterns, not as the orchestrator.
- **Temporal** is a durable-execution engine that could model the DAG and retries, but it is operationally heavyweight for a hackathon and adds a workflow-worker deployment surface we do not need; LangGraph's checkpointer already gives us the durability we require (resume-after-crash) with far less infrastructure.

The net result: LangGraph gives us the DAG shape, the bounded retry loop, the fan-out, the budget ledger, the real pause/resume, and the live stream — all as native primitives — while every intelligent decision inside the graph is a Qwen Cloud call.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | Next.js 14, React, Tailwind | Live dashboard consuming WebSocket events (budget ledger, critic trace, drift scores) |
| **Backend / Orchestration** | FastAPI (Python) + **LangGraph** | LangGraph is the chosen orchestration framework — see Section 2 for the full justification |
| **LLM / Reasoning** | Qwen (Qwen-Max / Qwen-Plus) via DashScope OpenAI-compatible endpoint | Concept Agent, Critic Chain checkers, Meta-Critic, Shot-List Agent |
| **Vision** | Qwen-VL via DashScope | Continuity Agent (product-identity drift + cross-shot style-consistency detection) |
| **Speech** | Qwen TTS / CosyVoice via DashScope | Voiceover synthesis + caption timing |
| **Video Generation** | Wan / HappyHorse (Tongyi Wanxiang / Alibaba video model family) | **Image-to-video only, never pure text-to-video** |
| **Video Assembly** | ffmpeg | Deterministic; not an LLM call |
| **Database** | Alibaba Cloud managed Postgres-compatible DB (PolarDB or RDS for PostgreSQL) | Job state, budget ledger, script/shot records |
| **Storage** | Alibaba Cloud Object Storage (OSS) | Product photos, generated shot clips, final videos, cached demo assets |
| **Deployment** | Alibaba Cloud ECS (default) or Function Compute | Backend must run here for the "Proof of Deployment" requirement |
| **Realtime** | WebSocket from FastAPI, fed by LangGraph's `astream_events` | Live dashboard: budget ledger, critic reasoning trace, drift scores |

**Model-routing note.** Every LLM, vision, and speech call — across all nodes — goes through DashScope's OpenAI-compatible API surface. This keeps the client code uniform (one SDK, one auth path), and it means the Qwen Cloud dependency is exercised on essentially every intelligent step in the pipeline, satisfying the hackathon's requirement that the Alibaba Cloud service be *actually called*, not merely referenced.

---

## 4. Agentic Architecture Diagram

```mermaid
flowchart TD
    U[Seller: photos + brief] --> ING[Ingest Node - validate, upload to OSS]
    ING --> CA[Concept Agent - Qwen-Max<br/>4 scripts, forced distinct frameworks/hooks]

    CA --> HC[Hook-Checker]
    CA --> PC[Pacing-Checker - deterministic timing math]
    CA --> CC[CTA-Checker]
    CA --> TC[Tone-Checker]
    HC --> MC[Meta-Critic - weighted aggregate + cross-pollinate merge]
    PC --> MC
    CC --> MC
    TC --> MC

    MC -->|winning script + reasoning trace| SL[Shot-List Agent - Qwen<br/>camera-literate schema]
    SL --> BG{Budget Gate}
    BG -->|over cap, 1 retry| SL
    BG -->|ok| BL[(Budget Ledger)]
    BG --> VGFO[Fan-out per shot - Send()]

    VGFO --> VG[Video-Gen Node<br/>image-to-video, ref photo required]
    VG -->|API failure| FB[Fallback: Ken-Burns pan]
    VG --> CTY[Continuity Agent - Qwen-VL<br/>drift + style-consistency check]
    CTY -->|drift, retries<2| VG
    CTY -->|drift, retries exhausted| HR[interrupt: Human Review in UI]
    HR -->|resume| VG
    HR -->|accept fallback| FB
    CTY -->|pass| ASM
    FB --> ASM[Assembly Agent - ffmpeg]

    MC --> VOX[Voiceover + Caption Agent - Qwen TTS<br/>synced to beat timestamps]
    VOX --> ASM

    ASM --> FMT[Format Export Node - ffmpeg<br/>9:16 / 1:1 / 16:9]
    FMT --> OUT[Final outputs to OSS]
    OUT --> FE[Frontend]

    BL -.->|live ledger stream| FE
    MC -.->|reasoning trace stream| FE
    CTY -.->|drift scores stream| FE

    subgraph Alibaba Cloud
        BL
        OSS[(Object Storage)]
        DB[(Job/State DB)]
    end
    OUT --> OSS
```

**Reading the diagram.** Solid arrows are graph edges (control/data flow). Dashed arrows are live streaming channels to the frontend via `astream_events` → WebSocket. The `Budget Gate` (diamond) and `interrupt: Human Review` (`HR`) are the two decision points that can loop or pause the graph. The Voiceover branch (`MC → VOX → ASM`) runs in parallel with the entire video-generation branch, because voiceover depends only on the finalized script, not on the rendered shots. Everything inside the `Alibaba Cloud` subgraph is a managed cloud resource (Budget Ledger table, Object Storage, Job/State DB).

---

## 5. Agent-by-Agent Detail

The pipeline is a mix of **reasoning nodes** (Qwen / Qwen-VL / Qwen TTS calls) and **deterministic nodes** (pure code — validation, timing math, budget arithmetic, ffmpeg). Deterministic nodes are deliberately *not* LLM calls: they are the parts of the pipeline where correctness must be guaranteed, not sampled. Each node below is documented with its purpose, model/API, input/output contract, prompt-design strategy (where applicable), and failure/edge-case handling.

### 5.1 Ingest Node — *deterministic*

**Purpose.** The pipeline's front door. Validates that the seller supplied 2–3 product photos and exactly one one-line creative brief, then establishes all the durable state the rest of the graph relies on.

**Model / API.** None — this is pure code. No LLM call.

**Inputs.** Raw upload payload: 2–3 image files and a free-text brief string.

**Outputs.** Photos persisted to OSS (returning stable object URIs); a new `jobs` row in the database with status `ingested`; and an initialized LangGraph state object carrying `job_id`, `brief`, and `product_photos[]` (the OSS URIs).

**Validation / edge cases.** Rejects submissions with fewer than 2 or more than 3 photos, empty or missing briefs, unsupported image formats, or files exceeding a size ceiling. Validation failures are returned to the frontend as actionable errors *before* any spend occurs — the Ingest Node is the cheap gate that prevents malformed jobs from consuming any Qwen or video-gen budget. Because it writes the OSS URIs and the job record up front, every downstream node has a stable reference store for the source product photos (which the Video-Gen and Continuity nodes depend on).

### 5.2 Concept Agent — Qwen-Max via DashScope

**Purpose.** Turn a one-line brief plus product photos into **four structurally distinct** short-form ad scripts. Distinctness is the point: four near-duplicate scripts give the Critic Chain nothing to negotiate over.

**Model / API.** Qwen-Max via DashScope's OpenAI-compatible endpoint (the strongest reasoning model in the family, used here because script quality anchors the entire downstream pipeline).

**Input contract.** `brief` (string), `product_photos[]` (OSS URIs, optionally described), and the target ad length (15s or 30s).

**Output contract.** A JSON array of four objects, each:
```json
{
  "variant_id": "v1",
  "text": "full script text",
  "framework": "PAS",
  "hook_type": "curiosity_gap",
  "emotional_trigger": "recognition",
  "beats": [{ "t_start": 0.0, "t_end": 2.5, "line": "..." }],
  "target_length_sec": 15
}
```

**Prompt-design strategy — enforced diversity, not temperature roulette.** Variety is guaranteed by *explicit constraint in the prompt*, not by nudging temperature and hoping. Each of the four scripts is required to use:
- **A different copywriting framework** — Hook-Problem-Product-CTA, **PAS** (Problem-Agitate-Solution), **AIDA** (Attention-Interest-Desire-Action), or **BAB** (Before-After-Bridge).
- **A different hook type** — drawn from: pattern interrupt, bold claim, curiosity gap, direct address, contrarian / myth-busting, social proof, POV, before/after, price anchor, FOMO / urgency, how-to.
- **A distinct emotional trigger** — curiosity, recognition, FOMO, tribal identity, transformation / aspiration, or relief.

Each script must additionally contain: a **single named pain point** (not a vague benefit), a **hook line of ≤10 words**, **beat-level timestamps**, and **exactly one CTA verb**. The beat timing obeys an explicit pacing rule: a new visual beat every **2–3 seconds for the first 2–3 beats**, then **3–5 seconds** thereafter — so a 15s ad resolves to **5–7 shots** and a 30s ad to **8–12 shots**.

**Failure handling.** If the model returns fewer than four variants, malformed JSON, or duplicated frameworks/hooks (diversity-constraint violation), the node re-prompts once with the specific violation called out. Persistent malformation degrades to the best N valid variants (minimum 2) so the Critic Chain still has something to compare; a single valid variant short-circuits the critic negotiation and proceeds with that variant flagged as un-negotiated in the reasoning trace.

### 5.3 Critic Chain — 4 parallel specialist checkers + 1 aggregator

This is the pipeline's **agent-negotiation / disagreement-resolution** centerpiece — the component the Track 2 brief explicitly wants judges to *see*. Rather than one monolithic critic, four specialists score the four candidate scripts along orthogonal axes in parallel, and a Meta-Critic reconciles them. The output is an auditable scoring trace and a merge justification, never a black-box pick.

#### 5.3.1 Hook-Checker — Qwen

**Purpose.** Score each script's hook for **specificity and strength**, 1–5, with written justification. A strong hook names a pain, cites a number, or makes a contrarian claim; a weak hook is generic. Concretely: *"Check out this amazing mug"* scores low; *"Your coffee is cold in 12 minutes. Mine isn't."* scores high. **Input:** the four scripts' hook lines (in context). **Output:** `{variant_id: {hook_score, justification}}`. **Prompt strategy:** the rubric ships example-anchored (weak vs. strong exemplars) so scores are calibrated rather than arbitrary.

#### 5.3.2 Pacing-Checker — *deterministic code, not an LLM call*

**Purpose.** Validate timing math with guaranteed correctness. It confirms the beat timestamps **sum to the target length**, that **each beat is within the 2–3s / 3–5s pacing window** per the rule, and that each **voiceover line fits its beat duration** at a spoken rate of **~2.3 words/second**. Because timing correctness is arithmetic, not judgment, it is code — an LLM would be a strictly worse choice here. **Output:** `{variant_id: {pacing_score, violations[]}}`, where violations name the exact offending beat and metric.

#### 5.3.3 CTA-Checker — Qwen

**Purpose.** Score **call-to-action clarity**. A good CTA is a single concrete verb plus a destination ("Tap to shop the autumn set"); a bad CTA is vague, missing, or competes with a second CTA. **Input:** each script's CTA line and surrounding closing beats. **Output:** `{variant_id: {cta_score, justification}}`. The checker specifically penalizes multiple competing CTAs, since split calls-to-action measurably depress conversion.

#### 5.3.4 Tone-Checker — Qwen

**Purpose.** Score **brand / tone fit against the seller's one-line brief**. If the brief says *"cozy autumn vibe"*, a hard-sell, high-urgency script scores lower on tone even if its hook is strong. **Input:** the brief plus each full script. **Output:** `{variant_id: {tone_score, justification}}`. This is the axis that keeps the merged result faithful to the seller's stated intent rather than optimizing purely for aggression.

#### 5.3.5 Meta-Critic — Qwen

**Purpose.** Aggregate and, critically, **cross-pollinate**. The Meta-Critic computes a **weighted composite** score per variant:

| Axis | Weight |
|---|---|
| Hook | 25% |
| Pacing | 20% |
| Completion / structural fit | 20% |
| CTA | 20% |
| Tone | 15% |

Then — the **advanced feature** — instead of picking a single variant wholesale, it **merges the best-scoring hook + best-scoring body + best-scoring CTA across all four variants into one winning script**. This mirrors how professional ad teams A/B-test hooks independently of body copy: the strongest opening might live in variant 2 while the strongest close lives in variant 4, and a wholesale pick would throw away one of them.

**Output contract.** The winning merged script **plus the full scoring trace and merge justification** — which axis-winner came from which variant, and why the merge is coherent. This trace streams live to the frontend (dashed edge `MC -.-> FE` in the diagram) so the negotiation is visible in the demo, not hidden. **Failure handling:** if cross-pollination would produce an incoherent script (e.g., a hook and body with clashing framing), the Meta-Critic falls back to the highest single composite-scoring variant and records that fallback in the trace.

### 5.4 Shot-List Agent — Qwen

**Purpose.** Convert the winning merged script into a concrete, **camera-literate** shot list of **3–7 shots**, each of which is a fully specified brief for the Video-Gen Node. This is where narrative becomes producible: the agent has to think like a director and a technical supervisor at once.

**Model / API.** Qwen (Qwen-Plus is sufficient here; the task is structured decomposition rather than open-ended reasoning).

**Input contract.** The `winning_script` (with beats) and the `target_length_sec`.

**Output contract — per-shot schema.** Every field exists for a specific downstream reason:

| Field | Purpose / why it exists |
|---|---|
| `shot_id` | Stable identity for fan-out, retries, ledger and asset joins |
| `t_start`, `t_end` | Position in the timeline; drives Assembly ordering and voiceover sync |
| `beat_role` | `hook \| problem \| demo \| proof \| cta` — narrative function of the shot; lets Assembly and budgeting weight hero/CTA shots |
| `description` | The actual **video-gen prompt text** for this shot |
| `shot_type` | Enum: `hook_hero \| macro_detail \| lifestyle_context \| hero_reframe \| cta_endcard` — constrains composition to a known-good vocabulary |
| `camera_move` | Enum: `push_in \| orbit \| static \| pan \| tilt_up \| pull_back`. **NEVER compound/stacked moves** — stacked camera moves visibly break current text-to-video models |
| `framing` | `fills_frame \| rule_of_thirds_left \| rule_of_thirds_right \| context_wide` |
| `lighting` | A **single shared style string reused across ALL shots** in the ad, e.g. *"soft key light, neutral background, clean commercial look"* — this is the primary lever for cross-shot visual consistency |
| `negative_prompt` | e.g. *"no extra logos, no text, no warping labels, no vignette, no hands morphing, no color shift"* — suppresses the failure modes that most often ruin AI product footage |
| `reference_image_id` | Points to one of the seller's uploaded product photos; used for **image-to-video conditioning** |
| `text_overlay_zone` | `none \| left_third \| right_third \| lower_third` — **reserved negative space** for post-generation caption/CTA burn-in. AI-generated on-screen text/logos garble, so text is *never* generated directly — it is composited later into this reserved zone |
| `duration_sec` | Short by design (3–5s) — **drift compounds over longer single-shot durations**, so we keep shots brief |
| `allocated_budget` | This shot's slice of the job's cost cap; consumed by the Budget Gate |
| `voiceover_line` | The script line spoken over this shot; the Voiceover Agent syncs to it |
| `status` | Lifecycle: `pending \| generating \| passed \| fallback \| review` |
| `retry_count` | Continuity-retry counter; the retry cap lives here in typed state |

**Prompt-design strategy.** The agent is instructed to keep shots **short (3–5s)** to limit drift, to **reuse one shared `lighting` string** across every shot for consistency, and to **reserve a `text_overlay_zone`** on any shot that will carry a caption or CTA so the composition leaves clean negative space. Camera moves are constrained to the single-move enum precisely because stacked moves are a known failure mode of the current video models.

**Failure handling.** If the agent produces more shots than the pacing rule allows, an out-of-enum camera move, or omits a `reference_image_id`, the node repairs deterministically where possible (clamping shot count, snapping to the nearest valid enum, defaulting the reference to the primary product photo) and re-prompts for anything it cannot safely repair.

### 5.5 Budget Gate — *deterministic conditional edge*

**Purpose.** Enforce the hard cost cap **before** any money is spent on video generation. This is the "quality under a limited budget" guarantee made concrete.

**Model / API.** None — a deterministic conditional edge in the graph.

**Logic.** Sums `allocated_budget` across all shots and compares against the job's hard cost cap. **If over cap:** loops back to the Shot-List Agent **exactly once**, with an explicit instruction to *"reduce shot count or per-shot budget."* On the second pass it **accepts whatever fits** — it never enters an unbounded loop. **If within cap:** writes the approved per-shot ledger entries to the **Budget Ledger** table and releases the shots to the fan-out. Because both the cap and the running spend live as plain fields on graph state, the gate is a pure function of state and the live ledger streams to the frontend (dashed edge `BL -.-> FE`).

### 5.6 Video-Gen Node — *orchestration around the Wan/HappyHorse API*

**Purpose.** Generate each shot as actual video. This node is orchestration, not reasoning — it does not "think," it constructs a well-formed generation request and calls the model. Shots fan out and run **in parallel via LangGraph's `Send()`**.

**Model / API.** Wan / HappyHorse (Tongyi Wanxiang video family) — **image-to-video mode only**.

**Prompt-construction strategy.** For each shot it assembles a structured prompt following the formula **Subject → Action/Motion → Camera → Lighting → Composition → Mood → Quality (80–120 words)**, then appends the shot's `negative_prompt`. It **always passes the reference product photo for image-to-video conditioning — never pure text-to-video.** The reference image is the single biggest lever against product-identity drift (color, shape, and label changes); generating from text alone would let the model invent a product that is not the seller's.

**Input contract.** A single shot object (from the shot list) plus the OSS URI of its `reference_image_id` photo. **Output contract.** `generated_shots[shot_id] = {video_uri, drift_score (set later by Continuity), attempt}`, with the clip persisted to OSS.

**Failure handling.** On a **hard API failure or timeout** — an actual call failure, *not* a quality issue — the node routes **immediately to the Fallback (Ken-Burns) node** and, importantly, **does not consume a Continuity retry**. The retry budget is reserved for quality problems; infrastructure failures are handled by graceful degradation instead.

### 5.7 Fallback Node — "Ken-Burns pan" — *deterministic*

**Purpose.** Keep the pipeline moving when a shot cannot be generated, rather than letting one failed API call sink the entire demo.

**Model / API.** None — deterministic ffmpeg.

**Behavior.** On a video-gen hard failure, it produces a simple **pan/zoom (Ken-Burns) animation over the static product photo** for the shot's duration, marks the shot `status = fallback`, and forwards it to Assembly. This demonstrates **graceful degradation under constraint** — a slightly less dynamic shot in an otherwise complete ad — instead of a failed run. It is also reachable from the human-review interrupt, where a seller can explicitly *accept the fallback* for a persistently drifting shot.

### 5.8 Continuity Agent — Qwen-VL via DashScope

**Purpose.** Guard visual fidelity. For each generated shot it checks two things: **(a) product-identity drift** — does the generated product still match the source reference photo in color, shape, and label? — and **(b) cross-shot style consistency** — does the shot match the shared `lighting`/style string used across the ad?

**Model / API.** Qwen-VL (vision-language) via DashScope.

**Input contract.** The generated shot's frame(s), the source reference product photo, and the shared lighting/style string. **Output contract.** A **drift/similarity score** written to `generated_shots[shot_id].drift_score`, plus a short justification streamed live to the dashboard (dashed edge `CTY -.-> FE`).

**Control flow / failure handling.**
- **Drift within threshold** → shot passes to Assembly.
- **Drift over threshold and `retry_count < 2`** → re-queues the shot to the Video-Gen Node with `retry_count` incremented (optionally with a tightened prompt).
- **Drift over threshold and retries exhausted** → triggers a **LangGraph `interrupt()`**. This is a *genuine pause/resume*, not a dead-end flag: the graph checkpoints, and the flagged shot surfaces in the seller-facing UI with three options — **approve as-is**, **retry with an edited prompt**, or **accept the Ken-Burns fallback**. When the seller responds, the graph **resumes from the checkpoint**. This makes the human a bounded escape valve for the hardest shots without stalling everything else.

### 5.9 Voiceover + Caption Agent — Qwen TTS / CosyVoice via DashScope

**Purpose.** Produce the ad's audio and caption timing. It runs as a **parallel branch that starts as soon as the winning script is finalized** (edge `MC → VOX`), because voiceover depends only on the script, not on the rendered video — so it overlaps with the entire multi-minute video-generation branch and costs no extra wall-clock time.

**Model / API.** Qwen TTS / CosyVoice via DashScope.

**Input contract.** The finalized winning script with per-beat timestamps. **Output contract.** `voiceover = {audio_uri, caption_track_uri}` — a synthesized voiceover audio track and a caption timing track, both **aligned to the script's beat timestamps** so Assembly can lay them against the matching shots. **Failure handling.** If synthesis fails for a line, the node retries that line; on persistent failure the ad can assemble with captions only (silent-with-captions is a valid short-form format), recorded in the trace.

### 5.10 Assembly Agent — ffmpeg, *deterministic (not an LLM call)*

**Purpose.** Cut the master video. **Model / API:** none — deterministic ffmpeg. It **stitches all approved and fallback shots in script order**, overlays the **voiceover audio track**, **burns captions and the CTA text into each shot's reserved `text_overlay_zone`**, and aligns basic transitions and the music-timing cue to the script's pacing. **Output:** a single **master cut** written to OSS (`master_cut_uri`). Because it consumes only the shot list's ordering/timing metadata and the pre-generated clips, it is fully deterministic and adds no model cost. Burning text into the reserved zones — rather than ever generating on-screen text — is what keeps captions and CTAs crisp instead of garbled.

### 5.11 Format Export Node — ffmpeg, *deterministic*

**Purpose.** Recompose the single master cut into **three aspect ratios** — **9:16** (TikTok/Reels/Shorts), **1:1** (feed), and **16:9** (YouTube) — by **recropping and repositioning the reserved text-overlay zones per format**. Because it reuses the already-generated shots, it incurs **no additional LLM or video-gen cost** — the reserved negative space from the shot schema is exactly what makes per-format recropping safe (text never gets cropped off, because its zone is known). **Output:** `exports = {aspect_9x16, aspect_1x1, aspect_16x9}`.

### 5.12 Output

**Purpose.** Finalize the job. Pushes the **final videos in all three formats to OSS**, marks the job **complete in the DB**, and emits the final event to the frontend, which then displays the results **plus the full cost and reasoning breakdown** (the four scripts, critic scores, merge justification, budget ledger, and drift scores). This closing transparency payload is what turns an autonomous black box into a demoable, auditable showrunner.

---

## 6. Shared State Schema

LangGraph passes a single typed state object through every node; each node reads the fields it needs and returns updates that LangGraph merges back in. This shared state is where the retry cap, the budget ledger, and the human-review queue physically live — which is what makes the bounded loops and pause/resume behavior inspectable rather than hidden in control flow.

```text
job_id
brief
product_photos[]

script_variants[]: {
    variant_id, text, framework, hook_type, emotional_trigger,
    beats: [{ t_start, t_end, line }],
    target_length_sec
}

critic_scores{ variant_id: { hook, pacing, cta, tone, composite, justification } }

winning_script
reasoning_trace

shot_list[]: {                      // full schema from Section 5.4
    shot_id, t_start, t_end, beat_role, description,
    shot_type, camera_move, framing, lighting, negative_prompt,
    reference_image_id, text_overlay_zone, duration_sec,
    allocated_budget, voiceover_line, status, retry_count
}

budget_ledger: { cap, spent, per_shot{} }

generated_shots{ shot_id: { video_uri, drift_score, attempt } }

voiceover: { audio_uri, caption_track_uri }

master_cut_uri

exports: { aspect_9x16, aspect_1x1, aspect_16x9 }

human_review_queue[]
```

**Notes on key fields.**
- `critic_scores` and `reasoning_trace` together form the streamed negotiation trace — they are populated by the Critic Chain and read by the frontend live.
- `shot_list[].retry_count` is where the Continuity retry cap is enforced; the conditional edge back to Video-Gen reads this field, so the loop is bounded by state, not by ad-hoc counters.
- `budget_ledger` is updated by the Shot-List Agent (allocations), the Budget Gate (approval), and the Video-Gen Node (actual spend), and streamed to the dashboard throughout.
- `human_review_queue` holds shots parked by a Continuity `interrupt()` awaiting seller resolution; the graph resumes from its checkpoint when an entry is resolved.

---

## 7. Database Design

ProductCut persists **structured relational state** in a managed Postgres-compatible database and **binary assets** in OSS. The split is deliberate: the job → shots → assets relationships are genuinely relational with clear foreign keys, so they belong in a relational DB; photos and video files are large opaque blobs that belong in object storage, never in the DB.

### 7.1 Recommended Engine

**Alibaba Cloud's managed Postgres-compatible database — PolarDB or RDS for PostgreSQL.** The data has clear foreign-key relationships (`jobs` → `shot_lists` → `generated_assets`), transactional budget-ledger writes, and structured JSON columns for the script/shot payloads — all of which a managed relational Postgres handles natively. OSS is used **purely for binary assets** (product photos, per-shot clips, master cuts, exports), referenced from the DB by URI — **not** for structured state.

### 7.2 Tables

| Table | Key columns | Why it must persist |
|---|---|---|
| `jobs` | `job_id` (PK), `seller_id`, `brief`, `status`, `created_at`, `product_photo_refs` | The root record for every submission; drives status/resume and links to all child rows |
| `budget_ledger` | `job_id` (FK), `shot_id` (FK), `allocated`, `spent`, `cap` | Per-shot budget accounting; source of the live cost dashboard and the hard-cap enforcement audit trail |
| `script_variants` | `job_id` (FK), `variant_id`, full script JSON, critic scores | Preserves all four candidate scripts and every critic score for the transparency breakdown and negotiation trace |
| `shot_lists` | `job_id` (FK), `shot_id`, full shot schema, `status`, `retry_count` | The producible shot plan; `status`/`retry_count` persistence is what lets a crashed run resume mid-generation |
| `generated_assets` | `job_id` (FK), `shot_id` (FK), `video_uri`, `drift_score`, `attempt_number` | Maps each generated (or fallback) clip in OSS back to its shot, with its drift score and attempt number |
| `human_review_events` | `job_id` (FK), `shot_id` (FK), `flagged_at`, `resolution` | Records every Continuity interrupt and how the seller resolved it — the human-in-the-loop audit log |

The foreign-key chain `jobs.job_id → shot_lists → generated_assets` (and `→ budget_ledger`, `→ human_review_events`) is exactly why a relational engine is the right choice: these joins are constant, and referential integrity keeps orphaned assets and ledger entries from accumulating.

---

## 8. Error Handling & Graceful Degradation

ProductCut treats robustness as a demo feature, not an afterthought: every failure mode has a **bounded, defined** outcome, and none of them can hang the pipeline in an unbounded loop.

- **Video-gen hard failure (API error / timeout).** Routes **immediately to the Ken-Burns fallback**, and **does not consume a Continuity retry.** Infrastructure failures and quality failures are handled by different mechanisms, so an outage doesn't burn the quality-retry budget.
- **Continuity drift.** Capped at **2 retries** back to Video-Gen. On exhaustion, escalates to a **human-review `interrupt()`** — a **real pause/resume via LangGraph's checkpointer**, not a dead-end flag. The seller resolves it (approve / edit-and-retry / accept fallback) and the graph resumes from the checkpoint.
- **Budget overrun at the shot-list stage.** **One** loop back to the Shot-List Agent with an explicit "reduce" instruction, then a **hard accept** of whatever fits — **never an infinite loop.**
- **Checkpoint-backed durability.** LangGraph's **checkpointer persists state at every node**, so a crashed or flaky run **resumes instead of restarting from scratch.** This same mechanism doubles as a **demo-day safety net**: a **pre-warmed cached run** can be resumed/replayed if live generation is flaky during the presentation.

The throughline: every loop in the system (retry, budget, review) has a hard cap or a human off-ramp, and every intermediate state is checkpointed — so the worst case is a slightly degraded ad delivered on time, never a hung or lost run.

---

## 9. Deployment on Alibaba Cloud

The entire backend runs on Alibaba Cloud, satisfying the hackathon's **Proof of Deployment** requirement. This section documents where each component runs and why.

### 9.1 Backend Compute — ECS (recommended) vs. Function Compute

The FastAPI + LangGraph application is deployed on **Alibaba Cloud ECS as the default choice.** The tradeoff:

- **ECS (recommended for this project).** A **persistent process** is the right fit because ProductCut relies on **long-lived WebSocket connections** (streaming the budget ledger, critic trace, and drift scores throughout a multi-minute run) and on **LangGraph checkpointing state** in memory / on disk between requests. A pipeline run takes minutes and streams continuously; a persistent server handles that naturally.
- **Function Compute (serverless).** Cheaper at idle, but **WebSocket and long-running graph execution are awkward on FaaS** — function timeouts and the stateless execution model fight both the multi-minute pipeline and the persistent stream. Function Compute is appropriate only for **stateless helper endpoints** (e.g., a thumbnail generator or a webhook receiver), not the orchestrator itself.

**Recommendation: ECS for the orchestrator**, specifically because of the long-lived WebSocket streaming and the multi-minute, checkpointed pipeline execution.

### 9.2 Qwen Cloud / DashScope — the model plane

**Every** LLM (Concept, Critic Chain, Meta-Critic, Shot-List), **vision** (Continuity via Qwen-VL), and **speech** (Voiceover via Qwen TTS/CosyVoice) call goes through **Qwen Cloud / DashScope's OpenAI-compatible API endpoint.** For the hackathon this must be **visibly, actually called in the codebase** — not merely referenced in docs. The submission includes a **recorded clip plus a linked code file demonstrating an actual Alibaba Cloud service call**, which is an explicit submission requirement. Because every intelligent node is a DashScope call, this requirement is satisfied pervasively rather than in a single token integration point.

### 9.3 Storage — OSS

Alibaba Cloud **Object Storage (OSS)** holds all binary assets: the seller's **product photos**, each **per-shot generated video clip**, the assembled **master cut**, and the **three aspect-ratio exports** (9:16 / 1:1 / 16:9). It also caches demo assets for the pre-warmed safety-net run. Structured state never lives in OSS — only blobs, referenced by URI from the DB.

### 9.4 Database — managed Postgres

The **managed Postgres-compatible DB (PolarDB or RDS for PostgreSQL)** holds all structured job and agent state from Section 7: jobs, budget ledger, script variants, shot lists, generated-asset records, and human-review events.

### 9.5 Realtime — WebSocket over `astream_events`

A **FastAPI WebSocket endpoint** is fed by LangGraph's **`astream_events`**, pushing **budget-ledger updates, the critic reasoning trace, and continuity drift scores** to the frontend **live during a run.** This is what makes the autonomous pipeline legible in the demo — judges watch the negotiation and the spend happen in real time.

### 9.6 Secrets & Configuration

All credentials — the **DashScope API key**, **video-gen (Wan/HappyHorse) API credentials**, the **DB connection string**, and **OSS access keys** — are injected via **Alibaba Cloud's secret/config management**, **never hardcoded** in the repository. This keeps the public GitHub repo (a submission requirement) free of live credentials while the deployed ECS instance receives them at runtime.

---

## 10. Judging Criteria Alignment

The hackathon weights four criteria. Below, each of ProductCut's features maps explicitly to the criterion it serves, so the demo walkthrough can point at concrete evidence for every point.

| Criterion | Weight | ProductCut features that satisfy it |
|---|---|---|
| **Technical Depth & Engineering** | **30%** | LangGraph DAG with a **bounded conditional retry loop** (Continuity → Video-Gen, capped at 2); **parallel fan-out via `Send()`**; **deterministic Budget Gate** with a hard cap and single reduce-loop; **checkpointer-backed resume** after crash; genuine **`interrupt()` pause/resume** human-in-the-loop; deterministic ffmpeg Assembly and multi-format Export; clean split of relational state (Postgres) vs. blobs (OSS) |
| **Innovation & AI Creativity** | **30%** | The **Critic Chain** — four parallel specialist checkers reconciled by a **Meta-Critic that cross-pollinates** the best hook + body + CTA across variants (visible negotiation, not a black box); **constraint-enforced script diversity** (distinct framework + hook + emotional trigger per variant, not temperature roulette); **camera-literate shot schema** with single-move constraints, shared lighting string, and reserved text-overlay zones tuned to real video-model failure modes |
| **Problem Value & Impact** | **25%** | A **named niche** (Etsy/Shopify sellers) with a real cost-savings story ($300–$1,500 studio ads → automated); output in **three ready-to-post aspect ratios**; **graceful degradation** (Ken-Burns fallback) so a seller always gets a finished ad; a **live cost dashboard** that makes spend transparent and bounded |
| **Presentation & Documentation** | **15%** | This complete technical document; the **mermaid architecture diagram**; the **live-streaming dashboard** (budget ledger, critic reasoning trace, drift scores) that makes the autonomous decisions watchable in real time; the closing **transparency breakdown** (four scripts, all critic scores, merge justification, ledger, drift scores) surfaced to the frontend |

**Cross-cutting note on Qwen Cloud usage.** Because every reasoning, vision, and speech decision routes through Qwen via DashScope, the "native Qwen Cloud usage" story is not confined to one integration point — it is exercised on essentially every intelligent node in the graph, and the LangGraph trace makes each call visible for judging.
