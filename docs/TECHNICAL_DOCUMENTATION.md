# ProductCut — Technical Documentation

### Global AI Hackathon with Qwen Cloud — Track 2: AI Showrunner

> **Document status.** This is the authoritative technical specification for ProductCut. It supersedes Section 3 (System Architecture) and Section 4 (Agent Roster) of `PROJECT_PROPOSAL.md`. Where the proposal and this document disagree, this document wins. The problem statement and motivation framing carried forward from the proposal remain valid. **This revision** adds two architectural extensions arising from a second research pass: (1) **script-driven, not category-driven, direction** — a Product Truth Extractor, a Treatment Agent, a justification-forced Shot-List schema, and a lightweight seller creative-intake, all aimed at killing "mode collapse" toward generic same-feeling output; and (2) **post-generation chat-based revision** — an Edit Router, Edit Interpreter, and checkpoint-based scoped re-execution that let a seller request a targeted fix ("make the hook punchier," "shot 2 is too dark") without re-running the whole pipeline. Both extensions are additive to the existing DAG; no prior node is removed.

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
| Autonomously handle scriptwriting → storyboarding → video generation → editing | Product Truth Extractor → Concept Agent → Critic Chain → Treatment Agent → Shot-List Agent → Video-Gen → Continuity → Assembly → Format Export, orchestrated as a single LangGraph graph |
| Demonstrate narrative ability | The Concept Agent produces four structurally distinct scripts, each using a different copywriting framework, hook type, and emotional trigger; the Critic Chain scores and cross-pollinates them into one winning narrative |
| Multimodal orchestration | Text (brief → script) → image (product photos, reference frames) → video (Wan/HappyHorse) → speech (Qwen TTS) → final assembled cut |
| Maximize output quality under a limited budget | An explicit per-shot cost budget is enforced by a deterministic Budget Gate with a hard cap, streamed live to a cost dashboard, with graceful degradation (Ken-Burns fallback) when a shot cannot be generated |
| Agent negotiation / disagreement resolution the track wants judges to see | The Critic Chain runs four parallel specialist checkers whose scores are reconciled by a Meta-Critic that cross-pollinates the best hook, body, and CTA across variants — a visible, auditable negotiation, not a black box |

### 1.3 What the System Produces

For each job, ProductCut outputs a finished short-form product ad in **three aspect ratios** — 9:16 (TikTok / Reels / Shorts), 1:1 (feed), and 16:9 (YouTube) — plus a full transparency breakdown: the four candidate scripts, every critic score, the merge justification, the director's treatment, the per-shot justification trace, the per-shot budget ledger, and the continuity drift scores. The transparency breakdown is a first-class deliverable, not a debug artifact: it is what makes the system's autonomous creative decisions legible to a judge (and, in production, to a seller who wants to understand why the system made the choices it made).

### 1.4 Two Extensions: Script-Driven Direction and Chat-Based Revision

A prior research pass identified a failure mode called **"the Price of Format"**: when an LLM agent is given a rigid, templated prompt (e.g., "pick a camera move for this product category"), the template itself acts as a behavioral anchor that collapses entropy — output feels generic regardless of what the actual product or script says. This document's two extensions directly counter that:

- **Script-driven direction (Section 5.2, 5.5, 5.6).** The Shot-List Agent's camera/composition choices must be justified by direct reference to *this job's* specific script text and *this job's* specific product facts — never by a category lookup table. A **Product Truth Extractor** pulls concrete, non-generic facts from the actual photos before any script is written; a **Treatment Agent** writes a short director's-treatment-style justification connecting the winning script's specific beats to a visual approach; the Shot-List Agent's output schema then requires a per-shot `justification` object that must cite exact words from the script and a specific extracted fact, which is mechanically validated.
- **Chat-based revision (Section 5.16).** Once a full ad is generated, the seller can request changes in natural language. Rather than re-running the entire graph, an **Edit Router** classifies the request to the minimal affected stage(s), an **Edit Interpreter** turns a vague instruction ("more energetic") into a specific, grounded parameter delta, and LangGraph's checkpointer **forks execution from the affected node** — re-running only the downstream nodes that actually need to change, with a cheap preview/diff and seller confirmation gating any expensive re-render.

---

## 2. Why This Architecture

### 2.1 The Pipeline Is a Budget-Capped DAG, Not a Conversation

The core architectural decision is the choice of orchestration framework. ProductCut's pipeline is **not** a free-form multi-agent conversation. It is a directed acyclic graph (DAG) with five specific structural properties that the framework must model natively:

1. **A conditional retry loop.** The Continuity Agent can send a shot back to the Video-Gen Node for re-generation, but only up to a hard cap of 2 retries, after which it escalates to human review.
2. **A scoring / merge step with a visible reasoning trace.** The Critic Chain must produce an auditable record of how four candidate scripts were scored and merged into one — this trace is a demo deliverable, not an implementation detail.
3. **Per-step budget / cost tracking with hard caps.** Every node that spends money (video generation especially) must debit a shared ledger, and a gate must be able to reject a plan that exceeds the cap.
4. **Parallel fan-out.** Multiple shots generate concurrently, then rejoin for assembly.
5. **Realtime progress streaming to a frontend.** The budget ledger, critic reasoning, and drift scores stream live to the dashboard while the graph runs.

To these five, the two extensions in this revision add a sixth and seventh property the framework must also model natively:

6. **Mechanically validated, quote-grounded structured output.** The Shot-List Agent's `justification` field is checked against the actual script text and truth-extraction record before the shot is accepted — a deterministic gate, not a vibe check.
7. **Resumable, forkable execution from an arbitrary interior node.** A chat-based edit must be able to re-enter the graph at Concept, Treatment, Shot-List, or Video-Gen — whichever stage the edit actually concerns — with modified state, and re-run only what's downstream of that node.

### 2.2 Framework Selection: LangGraph

**LangGraph was chosen** over CrewAI, Qwen-Agent, AutoGen/AG2, the OpenAI Agents SDK, LlamaIndex Workflows, and Temporal. It models all seven of the properties above as first-class primitives:

- **Conditional retry loop** → LangGraph **conditional edges**, with the retry cap living in **typed graph state** (`retry_count` per shot). The loop condition is a pure function of state, so it is inspectable and bounded by construction.
- **Fan-out / fan-in** → LangGraph's **`Send()`** primitive dispatches one Video-Gen task per shot in parallel, and the graph rejoins them at the Assembly node.
- **Budget ledger** → a plain field on shared state (`budget_ledger`) that every node updates; the Budget Gate is a deterministic conditional edge reading that field.
- **Human-in-the-loop** → LangGraph's **`interrupt()`** provides a genuine pause/resume, not a dead-end flag. The graph checkpoints, surfaces the flagged shot in the UI, and resumes from the checkpoint once the seller responds. The **same primitive** powers the pre-render "confirm this edit" gate in Section 5.16.
- **Realtime streaming** → LangGraph's **`astream_events`** emits per-node events that a FastAPI WebSocket endpoint forwards to the frontend.
- **Mechanical validation of structured output** → each reasoning node's output schema is a Pydantic model; a post-call deterministic validator function (not an LLM) checks the `justification` fields against the raw script/truth strings before the state update is accepted, re-prompting on failure (see Section 5.6).
- **Checkpoint-based forking** → LangGraph persists a checkpoint after every node via a `checkpointer` (Postgres-backed in production). `get_state_history(thread_id)` retrieves every past checkpoint of a job; `update_state(checkpoint_id, patch)` followed by `graph.invoke(None, config)` **forks a new execution branch from that checkpoint** with the patched state, re-running only nodes downstream of the fork point. This is the exact mechanism the chat-revision subsystem uses to avoid a full re-run.

Critically, **all model calls route through Qwen via DashScope's OpenAI-compatible endpoint**, so Qwen usage is deep and visible in every node's trace *regardless of the orchestration framework*. Choosing LangGraph for orchestration does not dilute the "native Qwen Cloud usage" story for judging — every reasoning, vision, and speech call is a Qwen Cloud call, and the LangGraph trace makes each one visible.

### 2.3 Why Not the Alternatives

- **LlamaIndex Workflows** was the **second choice**. It offers a similar event-driven fit (event-emitting steps map cleanly onto our streaming needs), but its human-in-the-loop story is less turnkey than LangGraph's `interrupt()` + checkpointer, and it has no equivalent to `update_state()`-driven forking, which the chat-revision subsystem depends on.
- **CrewAI, AutoGen/AG2, and Qwen-Agent** were rejected as *primary orchestrators* because they model **conversational, role-based delegation** — agents talking to agents — rather than a budget-capped DAG with parallel fan-out and a conditional, count-limited retry loop. Forcing our pipeline into a conversation abstraction would mean hand-rolling the graph, the budget gate, and the retry cap on top of a framework that fights that shape.
  - **Qwen-Agent specifically lacks a graph/edge primitive**, so building the retry loop and fan-out would mean writing the pipeline control flow by hand. It remains, however, an excellent reference for **tool-calling patterns** if we need them inside any single node — we treat it as a source of component-level patterns, not as the orchestrator.
- **Temporal** is a durable-execution engine that could model the DAG, retries, and even the fork-and-resume pattern, but it is operationally heavyweight for a hackathon and adds a workflow-worker deployment surface we do not need; LangGraph's checkpointer already gives us the durability (resume-after-crash) *and* the fork-from-node capability (chat revision) with far less infrastructure.

### 2.4 Countering Template Collapse — Script-Driven, Not Category-Driven, Direction

A prior research round on this project established that giving the Shot-List Agent a fixed per-product-category lookup table of camera moves ("mugs → macro + orbit; apparel → lifestyle wide") produces *"generic output with nouns swapped"* — the template itself is a behavioral anchor that collapses the model's entropy regardless of what the specific script says. Real commercial directors do not work this way: they write a **director's treatment**, a short document that argues, with reference to the *specific* script, why a specific visual approach fits *this* ad — reference imagery, color story, pacing philosophy, camera/lens choices, and an explicit rationale connecting each choice to the script's narrative beats, not to the product's category.

ProductCut encodes this as two new agents plus one schema change:

- **Product Truth Extractor** (Section 5.2) runs immediately after Ingest, before a single word of script is written. It is a Qwen-VL call that pulls specific, checkable facts from the actual uploaded photos — exact colors, materials, textures, distinguishing details, imperfections — into a `product_truths[]` list. Every fact carries a `truth_id`. This is the raw material that keeps everything downstream specific rather than generic.
- **Treatment Agent** (Section 5.5) runs after the Critic Chain has produced the winning script. It writes a ~250–400 word director's treatment: a persona (e.g. "kinetic, high-contrast, fast-cut director" vs. "quiet, tactile, slow-reveal director"), a color story, a pacing philosophy, and — critically — a one-sentence justification **per script beat**, each justification required to quote the script and cite a `truth_id`.
- **Justification-forced Shot-List schema** (Section 5.6): every shot object gains a `justification` field with `script_quote` and `truth_fact_id` sub-fields. A deterministic validator string-matches `script_quote` against the actual winning script text and `truth_fact_id` against a real entry in `product_truths[]`, rejecting (and forcing a re-prompt of) any shot whose justification cites nothing real or is generic enough to apply to any product. This mirrors research showing that quote-grounded, citation-forced generation measurably reduces hallucinated/generic output in structured LLM tasks.

A fourth, lighter-weight addition lets the **seller** inject their own specific creative direction beyond photos + one-line brief, modeled on how ad agencies run intake/discovery (mood words, reference ads liked/disliked, explicit "don't do this"): an optional, small **Intake** extension to Ingest (Section 5.1) capturing up to 3 mood words, one reference-ad link/description, one "never do this," and one freeform field — all optional, so the product never turns into a long form. This feeds the Product Truth Extractor (freeform text may name facts photos can't show), the Concept Agent (mood words bias framework/tone selection), the Treatment Agent (mood words bias persona selection), and the Critic Chain (the "never do this" becomes a hard rejection rule).

### 2.5 Post-Generation Revision — Scoped Regeneration, Not a Restart

Commercial tools that already ship "chat to edit" on generated media (e.g. Adobe Firefly's "Prompt to Edit," powered by Runway's Aleph model) apply a natural-language instruction as a **targeted patch to an existing clip** — analyzing the existing footage for context and editing in place — rather than regenerating from a blank slate. ProductCut adopts the same philosophy at the pipeline level, not just the single-clip level: a chat message is classified to the **minimal set of graph nodes that must re-run**, and LangGraph's checkpointer forks execution from that node with patched state, leaving every untouched upstream and sibling artifact byte-identical.

Three new components (Section 5.16) implement this:

- **Edit Router** — an LLM classification call that maps a chat message to `{scope, target_shot_ids[], entry_node}` (e.g. a tone complaint → `entry_node = concept`; "shot 2 is too dark" → `entry_node = shot_list`, `target_shot_ids = [shot_2]`; "shorten to 15s" → `entry_node = shot_list`, `scope = pacing`; "change the CTA text" → `entry_node = assembly`, no video-gen at all).
- **Edit Interpreter** — translates a vague instruction into a specific, grounded parameter delta *before* anything re-runs, so "make it more energetic" cannot regress back into generic output. It re-seeds the Treatment Agent's director persona toward a more kinetic profile and produces a concrete patch (e.g., shot durations 2.5s → 1.5s, add `camera_move: pan` on shots 2–3 only) — using the same script/truth-quote grounding discipline as Section 2.4, applied to the delta itself.
- **Preview/Confirm gate** — a LangGraph `interrupt()` fired *before* any Video-Gen re-render, showing the seller a cheap diff (old vs. new script/shot-list text plus an estimated incremental cost) and requiring explicit confirmation before the expensive call fires. This is the same `interrupt()` primitive already used for continuity human-review, applied to a second purpose.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | Next.js 14, React, Tailwind | Live dashboard consuming WebSocket events (budget ledger, critic trace, drift scores); post-generation view adds a chat panel and a diff/preview panel for edits |
| **Backend / Orchestration** | FastAPI (Python) + **LangGraph** | LangGraph is the chosen orchestration framework — see Section 2 for the full justification |
| **Orchestration durability** | LangGraph **Postgres checkpointer** (`langgraph-checkpoint-postgres`) | Persists a checkpoint after every node on the same managed Postgres instance as application data; this is what makes both crash-resume and chat-edit forking work without extra infrastructure |
| **LLM / Reasoning** | Qwen (Qwen-Max / Qwen-Plus) via DashScope OpenAI-compatible endpoint | Product Truth Extractor's text-side reasoning, Concept Agent, Critic Chain checkers, Meta-Critic, Treatment Agent, Shot-List Agent, Edit Router, Edit Interpreter |
| **Vision** | Qwen-VL via DashScope | Product Truth Extractor (photo → specific facts), Continuity Agent (product-identity drift + cross-shot style-consistency detection) |
| **Speech** | Qwen TTS / CosyVoice via DashScope | Voiceover synthesis + caption timing |
| **Video Generation** | Wan / HappyHorse (Tongyi Wanxiang / Alibaba video model family) | **Image-to-video only, never pure text-to-video** |
| **Video Assembly** | ffmpeg | Deterministic; not an LLM call |
| **Database** | Alibaba Cloud managed Postgres-compatible DB (PolarDB or RDS for PostgreSQL) | Job state, budget ledger, script/shot records, product truths, treatments, seller direction, chat/edit history, and the LangGraph checkpoint tables — all in one instance |
| **Storage** | Alibaba Cloud Object Storage (OSS) | Product photos, generated shot clips, final videos, cached demo assets |
| **Deployment** | Alibaba Cloud ECS (default) or Function Compute | Backend must run here for the "Proof of Deployment" requirement |
| **Realtime** | WebSocket from FastAPI, fed by LangGraph's `astream_events` | Live dashboard: budget ledger, critic reasoning trace, drift scores, edit-router decisions, preview diffs |

**Model-routing note.** Every LLM, vision, and speech call — across all nodes, including the two new agents and the chat-revision subsystem — goes through DashScope's OpenAI-compatible API surface. This keeps the client code uniform (one SDK, one auth path), and it means the Qwen Cloud dependency is exercised on essentially every intelligent step in the pipeline, satisfying the hackathon's requirement that the Alibaba Cloud service be *actually called*, not merely referenced.

**No new infrastructure required for either extension.** The Product Truth Extractor and Treatment Agent are additional Qwen/Qwen-VL calls on the existing graph; the chat-revision subsystem reuses the existing FastAPI + LangGraph + Postgres + OSS stack — the only addition is the `langgraph-checkpoint-postgres` package and three new tables (Section 7).

---

## 4. Agentic Architecture Diagram

```mermaid
flowchart TD
    U[Seller: photos + brief + optional intake] --> ING[Ingest Node - validate, upload to OSS, capture SellerDirection]
    ING --> PTE[Product Truth Extractor - Qwen-VL<br/>specific facts, colors, materials]
    PTE --> CA[Concept Agent - Qwen-Max<br/>4 scripts, forced distinct frameworks/hooks<br/>persona-seeded from truths + mood words]

    CA --> HC[Hook-Checker]
    CA --> PC[Pacing-Checker - deterministic timing math]
    CA --> CC[CTA-Checker]
    CA --> TC[Tone-Checker]
    HC --> MC[Meta-Critic - weighted aggregate + cross-pollinate merge]
    PC --> MC
    CC --> MC
    TC --> MC

    MC -->|winning script + reasoning trace| TA[Treatment Agent - Qwen<br/>director persona, color story,<br/>per-beat justification vs script+truths]
    TA --> SL[Shot-List Agent - Qwen<br/>camera-literate schema<br/>+ required per-shot justification]
    SL --> JV{Justification Validator}
    JV -->|quote/fact not found, re-prompt| SL
    JV -->|valid| BG{Budget Gate}
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

    FE -->|seller chat message| ER[Edit Router - Qwen<br/>classify scope + entry node]
    ER --> EI[Edit Interpreter - Qwen<br/>vague ask -> grounded delta]
    EI --> PV[interrupt: Preview/Confirm diff + cost]
    PV -->|confirm| FORK[Checkpointer fork -<br/>resume from entry node w/ patched state]
    PV -->|reject/refine| FE
    FORK -.->|re-enters graph at CA, TA, SL, or ASM| CA

    BL -.->|live ledger stream| FE
    MC -.->|reasoning trace stream| FE
    CTY -.->|drift scores stream| FE
    ER -.->|routing decision stream| FE

    subgraph Alibaba Cloud
        BL
        OSS[(Object Storage)]
        DB[(Job/State DB + LangGraph checkpoints)]
    end
    OUT --> OSS
```

**Reading the diagram.** Solid arrows are graph edges (control/data flow). Dashed arrows are live streaming channels to the frontend via `astream_events` → WebSocket. The `Budget Gate` and `Justification Validator` (diamonds) and `interrupt: Human Review` / `interrupt: Preview/Confirm` (`HR`, `PV`) are the decision points that can loop, pause, or fork the graph. The Voiceover branch (`MC → VOX → ASM`) runs in parallel with the entire video-generation branch, because voiceover depends only on the finalized script, not on the rendered shots. The **chat-revision loop** (`FE → ER → EI → PV → FORK`) is drawn re-entering at the Concept Agent, but `FORK`'s actual re-entry point is whatever `entry_node` the Edit Router chose — Concept, Treatment, Shot-List, or Assembly — never the whole graph from Ingest. Everything inside the `Alibaba Cloud` subgraph is a managed cloud resource (Budget Ledger table, Object Storage, Job/State DB, and now the LangGraph checkpoint tables that live in the same Postgres instance).

---

## 5. Agent-by-Agent Detail

The pipeline is a mix of **reasoning nodes** (Qwen / Qwen-VL / Qwen TTS calls) and **deterministic nodes** (pure code — validation, timing math, budget arithmetic, ffmpeg). Deterministic nodes are deliberately *not* LLM calls: they are the parts of the pipeline where correctness must be guaranteed, not sampled. Each node below is documented with its purpose, model/API, input/output contract, prompt-design strategy (where applicable), and failure/edge-case handling.

### 5.1 Ingest Node — *deterministic, with an optional structured intake*

**Purpose.** The pipeline's front door. Validates that the seller supplied 2–3 product photos and exactly one one-line creative brief, captures an **optional lightweight creative-intake**, then establishes all the durable state the rest of the graph relies on.

**Model / API.** None — this is pure code. No LLM call.

**Inputs.** Raw upload payload: 2–3 image files, a free-text brief string, and an optional `SellerDirection` object: up to 3 mood words, one reference-ad link or description ("I like the energy of X"), one explicit "never do this," and one freeform text field. All four intake fields are optional — the product never requires more than photos + one line to function; the intake exists purely to let a seller who *wants* to say more do so cheaply, mirroring how ad agencies run a lightweight discovery pass (mood words, liked/disliked references, explicit exclusions) without turning it into a long-form brief.

**Outputs.** Photos persisted to OSS (returning stable object URIs); a new `jobs` row in the database with status `ingested`; a `seller_direction` row if any intake field was filled; and an initialized LangGraph state object carrying `job_id`, `brief`, `product_photos[]` (the OSS URIs), and `seller_direction` (nullable).

**Validation / edge cases.** Rejects submissions with fewer than 2 or more than 3 photos, empty or missing briefs, unsupported image formats, or files exceeding a size ceiling. Validation failures are returned to the frontend as actionable errors *before* any spend occurs — the Ingest Node is the cheap gate that prevents malformed jobs from consuming any Qwen or video-gen budget. Because it writes the OSS URIs and the job record up front, every downstream node has a stable reference store for the source product photos (which the Product Truth Extractor, Video-Gen, and Continuity nodes depend on).

### 5.2 Product Truth Extractor — Qwen-VL via DashScope *(new)*

**Purpose.** Kill genericness at the source. Before a single word of script exists, this agent looks at the *actual* uploaded photos and extracts specific, checkable, non-generic facts — the raw material that keeps every downstream agent grounded in *this* product rather than falling back to category-level assumptions ("mugs are cozy and handmade-feeling").

**Model / API.** Qwen-VL via DashScope, given all 2–3 product photos plus the brief and any `seller_direction.freeform` text (which may name facts a photo can't show, e.g. "the wax finish smells like cedar").

**Output contract.** A `product_truths[]` array:
```json
{
  "truth_id": "t1",
  "fact": "hand-stitched leather cord wrap at the handle base, visibly irregular stitch spacing",
  "category": "material_detail",
  "source": "photo_2"
}
```
`category` is one of `color | material | texture | construction_detail | imperfection | scale_cue | brief_or_intake_fact`. The agent is instructed to produce **6–10 facts minimum**, each specific enough that it would be **false or absent for a different, similar product** (a generic fact like "the mug is ceramic" fails this bar; "a thin hairline glaze crack near the rim, left unrepaired as an intentional wabi-sabi detail" passes).

**Failure handling.** If the model returns fewer than 4 facts, or facts that are generic/reusable across arbitrary products (checked by a cheap heuristic: rejecting facts under ~6 words or matching a stoplist of generic adjectives), the node re-prompts once with the specific violation named. On persistent failure it proceeds with whatever facts passed the bar, flagged in the reasoning trace — the Concept and Treatment Agents downstream degrade gracefully to fewer, still-real anchors rather than blocking the job.

### 5.3 Concept Agent — Qwen-Max via DashScope

**Purpose.** Turn a one-line brief, product photos, and now `product_truths[]` plus optional `seller_direction` into **four structurally distinct** short-form ad scripts. Distinctness is the point: four near-duplicate scripts give the Critic Chain nothing to negotiate over.

**Model / API.** Qwen-Max via DashScope's OpenAI-compatible endpoint (the strongest reasoning model in the family, used here because script quality anchors the entire downstream pipeline).

**Input contract.** `brief` (string), `product_photos[]` (OSS URIs), `product_truths[]` (from Section 5.2), `seller_direction` (nullable — mood words, reference ad, never-do, freeform), and the target ad length (15s or 30s).

**Output contract.** A JSON array of four objects, each:
```json
{
  "variant_id": "v1",
  "text": "full script text",
  "framework": "PAS",
  "hook_type": "curiosity_gap",
  "emotional_trigger": "recognition",
  "grounding_truth_ids": ["t1", "t4"],
  "beats": [{ "t_start": 0.0, "t_end": 2.5, "line": "..." }],
  "target_length_sec": 15
}
```

**Prompt-design strategy — enforced diversity, not temperature roulette.** Variety is guaranteed by *explicit constraint in the prompt*, not by nudging temperature and hoping. Each of the four scripts is required to use:
- **A different copywriting framework** — Hook-Problem-Product-CTA, **PAS** (Problem-Agitate-Solution), **AIDA** (Attention-Interest-Desire-Action), or **BAB** (Before-After-Bridge).
- **A different hook type** — drawn from: pattern interrupt, bold claim, curiosity gap, direct address, contrarian / myth-busting, social proof, POV, before/after, price anchor, FOMO / urgency, how-to.
- **A distinct emotional trigger** — curiosity, recognition, FOMO, tribal identity, transformation / aspiration, or relief.

Each script must additionally contain: a **single named pain point** (not a vague benefit), a **hook line of ≤10 words**, **beat-level timestamps**, **exactly one CTA verb**, and — new — must cite at least **2 `truth_id`s** it is built around (`grounding_truth_ids`), so a script cannot be pure category-level boilerplate. If `seller_direction` is present, mood words bias framework/tone selection and the "never do this" is a hard constraint checked at the prompt level. The beat timing obeys an explicit pacing rule: a new visual beat every **2–3 seconds for the first 2–3 beats**, then **3–5 seconds** thereafter — so a 15s ad resolves to **5–7 shots** and a 30s ad to **8–12 shots**.

**Failure handling.** If the model returns fewer than four variants, malformed JSON, duplicated frameworks/hooks, or fewer than 2 `grounding_truth_ids` per variant, the node re-prompts once with the specific violation called out. Persistent malformation degrades to the best N valid variants (minimum 2) so the Critic Chain still has something to compare; a single valid variant short-circuits the critic negotiation and proceeds with that variant flagged as un-negotiated in the reasoning trace.

### 5.4 Critic Chain — 4 parallel specialist checkers + 1 aggregator

This is the pipeline's **agent-negotiation / disagreement-resolution** centerpiece — the component the Track 2 brief explicitly wants judges to *see*. Rather than one monolithic critic, four specialists score the four candidate scripts along orthogonal axes in parallel, and a Meta-Critic reconciles them. The output is an auditable scoring trace and a merge justification, never a black-box pick.

#### 5.4.1 Hook-Checker — Qwen

**Purpose.** Score each script's hook for **specificity and strength**, 1–5, with written justification. A strong hook names a pain, cites a number, or makes a contrarian claim; a weak hook is generic. Concretely: *"Check out this amazing mug"* scores low; *"Your coffee is cold in 12 minutes. Mine isn't."* scores high. **Input:** the four scripts' hook lines (in context). **Output:** `{variant_id: {hook_score, justification}}`. **Prompt strategy:** the rubric ships example-anchored (weak vs. strong exemplars) so scores are calibrated rather than arbitrary.

#### 5.4.2 Pacing-Checker — *deterministic code, not an LLM call*

**Purpose.** Validate timing math with guaranteed correctness. It confirms the beat timestamps **sum to the target length**, that **each beat is within the 2–3s / 3–5s pacing window** per the rule, and that each **voiceover line fits its beat duration** at a spoken rate of **~2.3 words/second**. Because timing correctness is arithmetic, not judgment, it is code — an LLM would be a strictly worse choice here. **Output:** `{variant_id: {pacing_score, violations[]}}`, where violations name the exact offending beat and metric.

#### 5.4.3 CTA-Checker — Qwen

**Purpose.** Score **call-to-action clarity**. A good CTA is a single concrete verb plus a destination ("Tap to shop the autumn set"); a bad CTA is vague, missing, or competes with a second CTA. **Input:** each script's CTA line and surrounding closing beats. **Output:** `{variant_id: {cta_score, justification}}`. The checker specifically penalizes multiple competing CTAs, since split calls-to-action measurably depress conversion.

#### 5.4.4 Tone-Checker — Qwen

**Purpose.** Score **brand / tone fit against the seller's one-line brief and any `seller_direction`**. If the brief says *"cozy autumn vibe"* or the intake names mood words like *"quiet, tactile"*, a hard-sell, high-urgency script scores lower on tone even if its hook is strong. If `seller_direction.never_do` is set, the checker also hard-fails any script that violates it. **Input:** the brief, `seller_direction`, and each full script. **Output:** `{variant_id: {tone_score, justification, never_do_violation: bool}}`. This is the axis that keeps the merged result faithful to the seller's stated intent rather than optimizing purely for aggression.

#### 5.4.5 Meta-Critic — Qwen

**Purpose.** Aggregate and, critically, **cross-pollinate**. The Meta-Critic computes a **weighted composite** score per variant:

| Axis | Weight |
|---|---|
| Hook | 25% |
| Pacing | 20% |
| Completion / structural fit | 20% |
| CTA | 20% |
| Tone | 15% |

Any variant with `never_do_violation = true` is excluded from consideration before weighting, regardless of composite score. Then — the **advanced feature** — instead of picking a single variant wholesale, it **merges the best-scoring hook + best-scoring body + best-scoring CTA across all four variants into one winning script**. This mirrors how professional ad teams A/B-test hooks independently of body copy: the strongest opening might live in variant 2 while the strongest close lives in variant 4, and a wholesale pick would throw away one of them.

**Output contract.** The winning merged script **plus the full scoring trace and merge justification** — which axis-winner came from which variant, and why the merge is coherent. This trace streams live to the frontend (dashed edge `MC -.-> FE` in the diagram) so the negotiation is visible in the demo, not hidden. **Failure handling:** if cross-pollination would produce an incoherent script (e.g., a hook and body with clashing framing), the Meta-Critic falls back to the highest single composite-scoring variant and records that fallback in the trace.

### 5.5 Treatment Agent — Qwen via DashScope *(new)*

**Purpose.** This is the agent-design answer to "how does a director translate a specific script into a specific shooting approach, instead of a category into a generic style guide." Modeled directly on a commercial director's treatment document, it produces a compact, script-anchored creative argument that the Shot-List Agent must build from — and every claim in it must be traceable to the actual script and actual product facts, not to genre convention.

**Model / API.** Qwen (Qwen-Plus) via DashScope.

**Input contract.** `winning_script` (with beats), `product_truths[]`, `seller_direction` (nullable).

**Output contract.**
```json
{
  "director_persona": "quiet, tactile, slow-reveal — favors stillness and macro detail over movement",
  "color_story": "warm neutrals, single accent of oxidized copper matching truth t3",
  "pacing_philosophy": "let the hook breathe for a full 3s before the first cut; no beat shorter than 2s",
  "beat_treatments": [
    {
      "beat_index": 0,
      "beat_function": "hook",
      "script_quote": "Your coffee is cold in 12 minutes. Mine isn't.",
      "truth_fact_id": "t3",
      "visual_approach": "static macro on the double-wall seam (t3) held through the line, no camera movement — the stillness IS the claim",
      "why_not_generic": "a push-in or orbit here would compete with the claim instead of proving it"
    }
  ]
}
```

**Prompt-design strategy — mapping beat function to shot grammar, not category to shot grammar.** The agent is explicitly instructed to reason from each beat's **narrative/emotional function** (hook = shock/tension, problem = discomfort, demo/proof = trust/clarity, CTA = urgency/clarity) to a camera treatment, and is **forbidden from naming the product category** as a justification anywhere in its output — a lightweight prompt-level guard (the word "category" and category names are disallowed in `why_not_generic`/`visual_approach`) that structurally blocks the laziest form of genericness. Every `beat_treatments[]` entry must include a verbatim `script_quote` and a real `truth_fact_id`.

**Failure handling.** If a beat treatment's `script_quote` cannot be found verbatim in `winning_script.text`, or `truth_fact_id` does not exist in `product_truths[]`, the node re-prompts once for that beat specifically (not the whole document). Persistent failure falls back to the single most literal, lowest-risk treatment for that beat (static framing, shared lighting only) rather than blocking the pipeline, flagged in the trace.

### 5.6 Shot-List Agent — Qwen

**Purpose.** Convert the winning script **and the Treatment Agent's document** into a concrete, **camera-literate** shot list of **3–7 shots**, each of which is a fully specified brief for the Video-Gen Node. This is where narrative becomes producible — and, per Section 2.4, where genericness is structurally blocked rather than merely discouraged.

**Model / API.** Qwen (Qwen-Plus is sufficient here; the task is structured decomposition rather than open-ended reasoning).

**Input contract.** `winning_script` (with beats), `treatment` (Section 5.5), `target_length_sec`. **Note: there is no `product_category` field anywhere in this contract or the shot schema** — this is deliberate. A category field is the seam through which a lookup-table shortcut would re-enter the system, so it is removed from the schema entirely rather than merely discouraged in the prompt.

**Output contract — per-shot schema.** Every field exists for a specific downstream reason:

| Field | Purpose / why it exists |
|---|---|
| `shot_id` | Stable identity for fan-out, retries, ledger and asset joins |
| `t_start`, `t_end` | Position in the timeline; drives Assembly ordering and voiceover sync |
| `beat_role` | `hook \| problem \| demo \| proof \| cta` — narrative function of the shot; also the key the Treatment Agent's beat-function-to-shot-grammar reasoning was keyed on |
| `description` | The actual **video-gen prompt text** for this shot |
| `shot_type` | Enum: `hook_hero \| macro_detail \| lifestyle_context \| hero_reframe \| cta_endcard` — a vocabulary of *compositional* options, not a category-keyed lookup; which option is chosen is decided per-job from the treatment, not fixed per product type |
| `camera_move` | Enum: `push_in \| orbit \| static \| pan \| tilt_up \| pull_back`. **NEVER compound/stacked moves** — stacked camera moves visibly break current text-to-video models |
| `framing` | `fills_frame \| rule_of_thirds_left \| rule_of_thirds_right \| context_wide` |
| `lighting` | A **single shared style string reused across ALL shots** in the ad, e.g. *"soft key light, neutral background, clean commercial look"* — sourced from the treatment's `color_story`, not a stock phrase |
| `negative_prompt` | e.g. *"no extra logos, no text, no warping labels, no vignette, no hands morphing, no color shift"* — suppresses the failure modes that most often ruin AI product footage |
| `reference_image_id` | Points to one of the seller's uploaded product photos; used for **image-to-video conditioning** |
| `text_overlay_zone` | `none \| left_third \| right_third \| lower_third` — **reserved negative space** for post-generation caption/CTA burn-in. AI-generated on-screen text/logos garble, so text is *never* generated directly — it is composited later into this reserved zone |
| `duration_sec` | Short by design (3–5s) — **drift compounds over longer single-shot durations**, so we keep shots brief |
| `allocated_budget` | This shot's slice of the job's cost cap; consumed by the Budget Gate |
| `voiceover_line` | The script line spoken over this shot; the Voiceover Agent syncs to it |
| `justification` | **New.** `{ script_quote: str, truth_fact_id: str, treatment_ref: str }` — `script_quote` must be a verbatim substring of `winning_script.text`; `truth_fact_id` must exist in `product_truths[]`; `treatment_ref` must match a `beat_treatments[].beat_index` from Section 5.5. This is the field that structurally forces every camera/composition decision to be script-conditioned rather than template-conditioned. |
| `status` | Lifecycle: `pending \| generating \| passed \| fallback \| review` |
| `retry_count` | Continuity-retry counter; the retry cap lives here in typed state |

**Prompt-design strategy.** The agent is instructed to keep shots **short (3–5s)** to limit drift, to **reuse one shared `lighting` string** across every shot for consistency, to **reserve a `text_overlay_zone`** on any shot that will carry a caption or CTA, and — new — to **write the `justification` before the rest of the shot fields**, so the camera/composition choice is generated as a consequence of an already-stated, quote-grounded reason rather than a post-hoc rationalization bolted on afterward. This ordering is itself the chain-of-thought/rationale-forcing technique: research on grounded structured generation shows that citation-forced reasoning produced *before* the final answer improves grounding more than a justification appended after the fact.

**Failure handling — deterministic Justification Validator.** After the LLM call, a pure-code validator runs before the Budget Gate:
1. For each shot, confirm `justification.script_quote` is a verbatim (fuzzy-matched, case-insensitive) substring of the winning script text.
2. Confirm `justification.truth_fact_id` exists in `product_truths[]`.
3. Confirm `justification.treatment_ref` exists in the treatment's `beat_treatments[]`.
4. Reject shots whose `script_quote` is under 4 words or whose combination of fields would validate against a stoplist of category-generic phrases ("show the product clearly," "highlight quality").

Any shot failing 1–4 triggers a **single re-prompt naming the exact violating shot and field**; on the second failure the node falls back to the corresponding treatment beat's literal `visual_approach` verbatim (which is already quote-grounded by construction) rather than blocking the job. Shots exceeding the pacing rule, using an out-of-enum camera move, or omitting a `reference_image_id` are repaired the same way as before (clamping shot count, snapping to nearest valid enum, defaulting the reference photo).

### 5.7 Budget Gate — *deterministic conditional edge*

**Purpose.** Enforce the hard cost cap **before** any money is spent on video generation. This is the "quality under a limited budget" guarantee made concrete.

**Model / API.** None — a deterministic conditional edge in the graph.

**Logic.** Sums `allocated_budget` across all shots and compares against the job's hard cost cap. **If over cap:** loops back to the Shot-List Agent **exactly once**, with an explicit instruction to *"reduce shot count or per-shot budget."* On the second pass it **accepts whatever fits** — it never enters an unbounded loop. **If within cap:** writes the approved per-shot ledger entries to the **Budget Ledger** table and releases the shots to the fan-out. Because both the cap and the running spend live as plain fields on graph state, the gate is a pure function of state and the live ledger streams to the frontend (dashed edge `BL -.-> FE`). Runs only **after** the Justification Validator (Section 5.6) has passed every shot, so budget is never spent evaluating a shot that would have been rejected on grounding grounds anyway.

### 5.8 Video-Gen Node — *orchestration around the Wan/HappyHorse API*

**Purpose.** Generate each shot as actual video. This node is orchestration, not reasoning — it does not "think," it constructs a well-formed generation request and calls the model. Shots fan out and run **in parallel via LangGraph's `Send()`**.

**Model / API.** Wan / HappyHorse (Tongyi Wanxiang video family) — **image-to-video mode only**.

**Prompt-construction strategy.** For each shot it assembles a structured prompt following the formula **Subject → Action/Motion → Camera → Lighting → Composition → Mood → Quality (80–120 words)**, then appends the shot's `negative_prompt`. It **always passes the reference product photo for image-to-video conditioning — never pure text-to-video.** The reference image is the single biggest lever against product-identity drift (color, shape, and label changes); generating from text alone would let the model invent a product that is not the seller's.

**Input contract.** A single shot object (from the shot list) plus the OSS URI of its `reference_image_id` photo. **Output contract.** `generated_shots[shot_id] = {video_uri, drift_score (set later by Continuity), attempt}`, with the clip persisted to OSS.

**Failure handling.** On a **hard API failure or timeout** — an actual call failure, *not* a quality issue — the node routes **immediately to the Fallback (Ken-Burns) node** and, importantly, **does not consume a Continuity retry**. The retry budget is reserved for quality problems; infrastructure failures are handled by graceful degradation instead.

### 5.9 Fallback Node — "Ken-Burns pan" — *deterministic*

**Purpose.** Keep the pipeline moving when a shot cannot be generated, rather than letting one failed API call sink the entire demo.

**Model / API.** None — deterministic ffmpeg.

**Behavior.** On a video-gen hard failure, it produces a simple **pan/zoom (Ken-Burns) animation over the static product photo** for the shot's duration, marks the shot `status = fallback`, and forwards it to Assembly. This demonstrates **graceful degradation under constraint** — a slightly less dynamic shot in an otherwise complete ad — instead of a failed run. It is also reachable from the human-review interrupt, where a seller can explicitly *accept the fallback* for a persistently drifting shot.

### 5.10 Continuity Agent — Qwen-VL via DashScope

**Purpose.** Guard visual fidelity. For each generated shot it checks two things: **(a) product-identity drift** — does the generated product still match the source reference photo in color, shape, and label? — and **(b) cross-shot style consistency** — does the shot match the shared `lighting`/style string used across the ad?

**Model / API.** Qwen-VL (vision-language) via DashScope.

**Input contract.** The generated shot's frame(s), the source reference product photo, and the shared lighting/style string. **Output contract.** A **drift/similarity score** written to `generated_shots[shot_id].drift_score`, plus a short justification streamed live to the dashboard (dashed edge `CTY -.-> FE`).

**Control flow / failure handling.**
- **Drift within threshold** → shot passes to Assembly.
- **Drift over threshold and `retry_count < 2`** → re-queues the shot to the Video-Gen Node with `retry_count` incremented (optionally with a tightened prompt).
- **Drift over threshold and retries exhausted** → triggers a **LangGraph `interrupt()`**. This is a *genuine pause/resume*, not a dead-end flag: the graph checkpoints, and the flagged shot surfaces in the seller-facing UI with three options — **approve as-is**, **retry with an edited prompt**, or **accept the Ken-Burns fallback**. When the seller responds, the graph **resumes from the checkpoint**. This makes the human a bounded escape valve for the hardest shots without stalling everything else.

### 5.11 Voiceover + Caption Agent — Qwen TTS / CosyVoice via DashScope

**Purpose.** Produce the ad's audio and caption timing. It runs as a **parallel branch that starts as soon as the winning script is finalized** (edge `MC → VOX`), because voiceover depends only on the script, not on the rendered video — so it overlaps with the entire multi-minute video-generation branch and costs no extra wall-clock time.

**Model / API.** Qwen TTS / CosyVoice via DashScope.

**Input contract.** The finalized winning script with per-beat timestamps. **Output contract.** `voiceover = {audio_uri, caption_track_uri}` — a synthesized voiceover audio track and a caption timing track, both **aligned to the script's beat timestamps** so Assembly can lay them against the matching shots. **Failure handling.** If synthesis fails for a line, the node retries that line; on persistent failure the ad can assemble with captions only (silent-with-captions is a valid short-form format), recorded in the trace.

### 5.12 Assembly Agent — ffmpeg, *deterministic (not an LLM call)*

**Purpose.** Cut the master video. **Model / API:** none — deterministic ffmpeg. It **stitches all approved and fallback shots in script order**, overlays the **voiceover audio track**, **burns captions and the CTA text into each shot's reserved `text_overlay_zone`**, and aligns basic transitions and the music-timing cue to the script's pacing. **Output:** a single **master cut** written to OSS (`master_cut_uri`). Because it consumes only the shot list's ordering/timing metadata and the pre-generated clips, it is fully deterministic and adds no model cost. Burning text into the reserved zones — rather than ever generating on-screen text — is what keeps captions and CTAs crisp instead of garbled. This is also the node a **CTA-text-only chat edit** (Section 5.16) re-enters directly, since changing overlay text never requires touching a video clip.

### 5.13 Format Export Node — ffmpeg, *deterministic*

**Purpose.** Recompose the single master cut into **three aspect ratios** — **9:16** (TikTok/Reels/Shorts), **1:1** (feed), and **16:9** (YouTube) — by **recropping and repositioning the reserved text-overlay zones per format**. Because it reuses the already-generated shots, it incurs **no additional LLM or video-gen cost** — the reserved negative space from the shot schema is exactly what makes per-format recropping safe (text never gets cropped off, because its zone is known). **Output:** `exports = {aspect_9x16, aspect_1x1, aspect_16x9}`.

### 5.14 Output

**Purpose.** Finalize the job. Pushes the **final videos in all three formats to OSS**, marks the job **complete in the DB**, and emits the final event to the frontend, which then displays the results **plus the full cost and reasoning breakdown** (the four scripts, critic scores, merge justification, the director's treatment, per-shot justifications, budget ledger, and drift scores). This closing transparency payload is what turns an autonomous black box into a demoable, auditable showrunner — and it is also the state the chat-revision subsystem (Section 5.16) treats as its starting checkpoint.

### 5.15 SellerDirection & Truth/Treatment Recap *(schema note, not a node)*

Sections 5.1, 5.2, and 5.5 together form the "script-driven direction" extension described in Section 2.4. There is no additional node here — this subsection exists purely to make the data lineage explicit: `seller_direction` (5.1) → informs → `product_truths[]` (5.2) and `Concept Agent` (5.3) → informs → `Treatment Agent` (5.5) → informs → `Shot-List Agent` (5.6), with the **Justification Validator** as the single mechanical checkpoint that enforces the whole chain actually stayed grounded end to end.

### 5.16 Chat-Based Revision Subsystem *(new — post-generation)*

**Purpose.** Once `Output` (5.14) has produced a finished ad, the seller can converse in natural language to request a change ("make the hook punchier," "the second shot feels too dark," "shorten it to 15s," "change the CTA text") and get a **targeted fix**, not a full re-run. This subsystem is a separate, small sub-graph that attaches to the completed job's checkpoint rather than a modification of the main pipeline's edges.

#### 5.16.1 Edit Router — Qwen via DashScope

**Purpose.** Classify a chat message to the minimal graph re-entry point. **Input:** the chat message, the current job's full state snapshot (script, treatment, shot list, generated assets). **Output contract:**
```json
{
  "scope": "shot_visual | copy_tone | pacing_length | cta_text | global",
  "target_shot_ids": ["shot_3"],
  "entry_node": "shot_list",
  "confidence": 0.92,
  "rationale": "message names 'the second shot' and 'too dark' -> lighting/exposure change scoped to one shot"
}
```
**Routing table** (the concrete mapping from research into this codebase):

| Chat message pattern | `scope` | `entry_node` | Re-runs |
|---|---|---|---|
| "make the hook punchier" / tone complaint | `copy_tone` | `concept` | Concept + Critic Chain + Treatment + Shot-List (only hook shots) + Video-Gen (only hook shots) |
| "shot 2 is too dark" / single-shot visual complaint | `shot_visual` | `shot_list` | Shot-List (one shot) + Video-Gen (one shot) + Continuity (one shot) |
| "shorten it to 15s" | `pacing_length` | `shot_list` | Shot-List (re-time/drop shots) + Assembly + Export — **no Video-Gen call** if trimming existing clips suffices |
| "change the CTA text" | `cta_text` | `assembly` | Assembly + Export only — **zero LLM reasoning calls beyond the router, zero video-gen** |
| "more energetic overall" | `global` | `concept` (via Treatment re-seed) | Treatment (new persona) + Shot-List (all shots) + Video-Gen (all shots) — the one path that is intentionally expensive, because the ask is genuinely global |

**Failure handling.** Below a confidence threshold (e.g. 0.6), the router does not guess — it asks a clarifying question in the chat UI instead of silently picking a scope.

#### 5.16.2 Edit Interpreter — Qwen via DashScope

**Purpose.** Prevent chat-based revision from reintroducing genericness. Vague asks are translated into a **specific, grounded parameter delta** before anything re-runs — the same discipline as Section 2.4, applied to an edit rather than a first pass.

**Input contract.** The chat message, the Edit Router's output, and the current `treatment` / `shot_list` / `winning_script` slices relevant to `target_shot_ids`. **Output contract.** A patch object, e.g. for "more energetic":
```json
{
  "treatment_patch": { "director_persona": "kinetic, high-contrast, fast-cut — favors movement and quick reveals" },
  "shot_patches": [
    { "shot_id": "shot_2", "duration_sec": 1.5, "camera_move": "pan" },
    { "shot_id": "shot_3", "duration_sec": 1.5, "camera_move": "push_in" }
  ],
  "justification": "persona re-seeded per chat request; durations tightened from 2.5s to fit a faster-cut pacing philosophy consistent with the new persona"
}
```
Every patch field still passes through the **same Justification Validator** from Section 5.6 before it is accepted — an edit patch is not exempt from grounding requirements.

#### 5.16.3 Preview/Confirm Gate — LangGraph `interrupt()`

**Purpose.** Video-gen calls cost real money; no re-render fires without the seller seeing what will change and approving it first. **Behavior.** Before the forked branch reaches Video-Gen, the graph interrupts and the frontend renders a **diff view**: old vs. new script text (if changed), old vs. new shot cards (camera move, duration, justification) for every `target_shot_ids` entry, and an **estimated incremental cost** (number of shots that will actually re-render × per-shot cost from the Budget Ledger). The seller either **confirms** (graph resumes, forked branch proceeds to Video-Gen) or **rejects/refines** (returns to chat, no spend occurs). This reuses the identical `interrupt()` primitive as the Continuity human-review gate (Section 5.10) — same mechanism, second purpose.

#### 5.16.4 Scoped Re-execution — LangGraph checkpoint fork

**Purpose.** Actually perform the "re-run only what's downstream" guarantee. **Mechanism.** Every completed job is a LangGraph `thread_id` with a full checkpoint history (one checkpoint per node, per Section 2.2). On confirm, the backend calls `get_state_history(thread_id)` to find the checkpoint corresponding to `entry_node`, calls `update_state(checkpoint_id, patch)` with the Edit Interpreter's patch, then `graph.invoke(None, {"configurable": {"thread_id": new_branch_id}})` — which **creates a new branch** starting from that checkpoint with the patched state, re-running only nodes downstream of `entry_node`. Untouched shots' `generated_shots[shot_id]` entries are copied byte-identical into the new branch's state (their OSS URIs are simply reused, no re-render), so Assembly only ever re-stitches what actually changed. Every branch is retained (not overwritten) so the seller can revert to any prior version from a version list in the UI.

**Failure handling.** If a fork's re-run fails (e.g. a re-generated shot drifts and exhausts retries), it surfaces the same Continuity `interrupt()` as a first-pass run would — the chat-revision path shares every downstream failure-handling mechanism already built for the main pipeline; it does not need its own.

---

## 6. Shared State Schema

LangGraph passes a single typed state object through every node; each node reads the fields it needs and returns updates that LangGraph merges back in. This shared state is where the retry cap, the budget ledger, the human-review queue, and now the truth/treatment/justification/edit lineage physically live — which is what makes the bounded loops, pause/resume behavior, and scoped re-execution inspectable rather than hidden in control flow.

```text
job_id
brief
product_photos[]
seller_direction: {                 // nullable — all fields optional
    mood_words[], reference_ad{ url_or_text, why }, never_do, freeform
}

product_truths[]: {                 // NEW — Section 5.2
    truth_id, fact, category, source
}

script_variants[]: {
    variant_id, text, framework, hook_type, emotional_trigger,
    grounding_truth_ids[],           // NEW
    beats: [{ t_start, t_end, line }],
    target_length_sec
}

critic_scores{ variant_id: { hook, pacing, cta, tone, composite, justification, never_do_violation } }

winning_script
reasoning_trace

treatment: {                        // NEW — Section 5.5
    director_persona, color_story, pacing_philosophy,
    beat_treatments[]: { beat_index, beat_function, script_quote, truth_fact_id, visual_approach, why_not_generic }
}

shot_list[]: {                      // full schema from Section 5.6
    shot_id, t_start, t_end, beat_role, description,
    shot_type, camera_move, framing, lighting, negative_prompt,
    reference_image_id, text_overlay_zone, duration_sec,
    allocated_budget, voiceover_line, status, retry_count,
    justification: { script_quote, truth_fact_id, treatment_ref }   // NEW
}

budget_ledger: { cap, spent, per_shot{} }

generated_shots{ shot_id: { video_uri, drift_score, attempt } }

voiceover: { audio_uri, caption_track_uri }

master_cut_uri

exports: { aspect_9x16, aspect_1x1, aspect_16x9 }

human_review_queue[]

// --- Chat-revision fields (NEW — Section 5.16) ---
chat_thread[]: { role, message, ts }
edit_requests[]: {
    edit_id, message, router_output{ scope, target_shot_ids, entry_node, confidence, rationale },
    interpreter_patch{ treatment_patch, shot_patches[], justification },
    status: "pending_preview | confirmed | rejected | applied | failed",
    fork_branch_id, estimated_cost, actual_cost
}
version_history[]: { branch_id, parent_branch_id, created_at, summary }
```

**Notes on key fields.**
- `product_truths[]`, `treatment`, and `shot_list[].justification` together are the mechanical backbone of "script-driven, not category-driven" direction (Section 2.4) — every one of them is validated against the others by the Justification Validator before the Budget Gate runs.
- `critic_scores` and `reasoning_trace` together form the streamed negotiation trace — they are populated by the Critic Chain and read by the frontend live.
- `shot_list[].retry_count` is where the Continuity retry cap is enforced; the conditional edge back to Video-Gen reads this field, so the loop is bounded by state, not by ad-hoc counters.
- `budget_ledger` is updated by the Shot-List Agent (allocations), the Budget Gate (approval), and the Video-Gen Node (actual spend), and streamed to the dashboard throughout.
- `human_review_queue` holds shots parked by a Continuity `interrupt()` awaiting seller resolution; the graph resumes from its checkpoint when an entry is resolved.
- `edit_requests[]` and `version_history[]` are populated only by the chat-revision subsystem (Section 5.16); `fork_branch_id` is the LangGraph `thread_id` of the branch created by a confirmed edit, and `version_history[]` is what the "old vs. new" version picker in the UI reads.

---

## 7. Database Design

ProductCut persists **structured relational state** in a managed Postgres-compatible database and **binary assets** in OSS. The split is deliberate: the job → shots → assets relationships are genuinely relational with clear foreign keys, so they belong in a relational DB; photos and video files are large opaque blobs that belong in object storage, never in the DB.

### 7.1 Recommended Engine

**Alibaba Cloud's managed Postgres-compatible database — PolarDB or RDS for PostgreSQL.** The data has clear foreign-key relationships (`jobs` → `shot_lists` → `generated_assets`), transactional budget-ledger writes, and structured JSON columns for the script/shot/treatment/truth payloads — all of which a managed relational Postgres handles natively. OSS is used **purely for binary assets** (product photos, per-shot clips, master cuts, exports), referenced from the DB by URI — **not** for structured state. The same instance also hosts the **LangGraph checkpoint tables** (`langgraph-checkpoint-postgres`'s own schema), so no second database is introduced for the chat-revision subsystem.

### 7.2 Tables

| Table | Key columns | Why it must persist |
|---|---|---|
| `jobs` | `job_id` (PK), `seller_id`, `brief`, `status`, `created_at`, `product_photo_refs` | The root record for every submission; drives status/resume and links to all child rows |
| `seller_direction` | `job_id` (FK), `mood_words[]`, `reference_ad_url_or_text`, `reference_ad_why`, `never_do`, `freeform` | Persists the optional intake so it can be re-read by any later chat edit, not just the first pass |
| `product_truths` | `job_id` (FK), `truth_id`, `fact`, `category`, `source_photo` | The grounding facts every downstream justification must cite; needed for audit and for the Justification Validator to re-check on edit forks |
| `budget_ledger` | `job_id` (FK), `shot_id` (FK), `allocated`, `spent`, `cap` | Per-shot budget accounting; source of the live cost dashboard, the hard-cap enforcement audit trail, and the chat-edit "estimated incremental cost" preview |
| `script_variants` | `job_id` (FK), `variant_id`, full script JSON, critic scores | Preserves all four candidate scripts and every critic score for the transparency breakdown and negotiation trace |
| `treatments` | `job_id` (FK), `version` (int), full treatment JSON | One row per treatment version — the original plus any chat-edit re-seed, so the UI can show "persona was X, now Y" |
| `shot_lists` | `job_id` (FK), `shot_id`, `version` (int), full shot schema incl. `justification`, `status`, `retry_count` | The producible shot plan; `status`/`retry_count` persistence is what lets a crashed run resume mid-generation; `version` lets a chat-edited shot coexist with its prior version for the diff view |
| `generated_assets` | `job_id` (FK), `shot_id` (FK), `version` (int), `video_uri`, `drift_score`, `attempt_number` | Maps each generated (or fallback) clip in OSS back to its shot and version, with its drift score and attempt number; untouched-shot rows are simply reused across chat-edit versions, not duplicated |
| `human_review_events` | `job_id` (FK), `shot_id` (FK), `flagged_at`, `resolution` | Records every Continuity interrupt and how the seller resolved it — the human-in-the-loop audit log |
| `chat_edit_requests` | `job_id` (FK), `edit_id`, `message`, `router_output` (JSON), `interpreter_patch` (JSON), `status`, `fork_branch_id`, `estimated_cost`, `actual_cost`, `created_at` | The full audit trail of every chat-based edit request, its routing decision, its grounded patch, and its eventual cost — needed both for the preview/diff UI and for judging transparency |
| `job_versions` | `job_id` (FK), `branch_id` (= LangGraph `thread_id`), `parent_branch_id`, `created_at`, `summary` | The version tree the seller navigates ("v1 original", "v2: punchier hook", "v3: 15s cut"); `parent_branch_id` lets the UI render it as a tree, not just a flat list |

The foreign-key chain `jobs.job_id → shot_lists → generated_assets` (and `→ budget_ledger`, `→ human_review_events`, `→ chat_edit_requests`, `→ job_versions`) is exactly why a relational engine is the right choice: these joins are constant, and referential integrity keeps orphaned assets and ledger entries from accumulating — including across chat-edit branches, where a naive design could otherwise silently duplicate or orphan asset rows.

---

## 8. Error Handling & Graceful Degradation

ProductCut treats robustness as a demo feature, not an afterthought: every failure mode has a **bounded, defined** outcome, and none of them can hang the pipeline in an unbounded loop.

- **Video-gen hard failure (API error / timeout).** Routes **immediately to the Ken-Burns fallback**, and **does not consume a Continuity retry.** Infrastructure failures and quality failures are handled by different mechanisms, so an outage doesn't burn the quality-retry budget.
- **Continuity drift.** Capped at **2 retries** back to Video-Gen. On exhaustion, escalates to a **human-review `interrupt()`** — a **real pause/resume via LangGraph's checkpointer**, not a dead-end flag. The seller resolves it (approve / edit-and-retry / accept fallback) and the graph resumes from the checkpoint.
- **Budget overrun at the shot-list stage.** **One** loop back to the Shot-List Agent with an explicit "reduce" instruction, then a **hard accept** of whatever fits — **never an infinite loop.**
- **Justification/grounding failure (new).** A shot whose `justification` fails the deterministic validator (Section 5.6) gets **one** targeted re-prompt naming the exact violation; on a second failure it falls back to the treatment's literal `visual_approach` text for that beat (already quote-grounded) rather than blocking the job — the same "bounded retry, then safe deterministic fallback" shape as every other loop in the system.
- **Chat-edit routing ambiguity (new).** If the Edit Router's confidence is below threshold, it does not guess a scope — it asks a clarifying question in chat. This prevents a misrouted edit from silently re-rendering the wrong shot and spending budget on the wrong fix.
- **Chat-edit re-render failure (new).** A forked branch's Video-Gen or Continuity failure is handled by the **same** fallback/retry/interrupt machinery as a first-pass run (Sections 5.9, 5.10) — no separate error-handling path was built for edits, which keeps the failure surface to one set of mechanisms.
- **Checkpoint-backed durability.** LangGraph's **checkpointer persists state at every node**, so a crashed or flaky run **resumes instead of restarting from scratch.** This same mechanism doubles as a **demo-day safety net** (a **pre-warmed cached run** can be resumed/replayed if live generation is flaky during the presentation) and as the **substrate for chat-edit forking** — one persistence mechanism serves crash-recovery, demo replay, and scoped revision.

The throughline: every loop in the system (retry, budget, review, justification, edit-routing) has a hard cap or a human off-ramp, and every intermediate state is checkpointed — so the worst case is a slightly degraded ad delivered on time, never a hung or lost run, and a chat edit that goes wrong never costs more than the one shot it touched.

---

## 9. Deployment on Alibaba Cloud

The entire backend runs on Alibaba Cloud, satisfying the hackathon's **Proof of Deployment** requirement. This section documents where each component runs and why.

### 9.1 Backend Compute — ECS (recommended) vs. Function Compute

The FastAPI + LangGraph application is deployed on **Alibaba Cloud ECS as the default choice.** The tradeoff:

- **ECS (recommended for this project).** A **persistent process** is the right fit because ProductCut relies on **long-lived WebSocket connections** (streaming the budget ledger, critic trace, and drift scores throughout a multi-minute run) and on **LangGraph checkpointing state** in memory / on disk between requests. A pipeline run takes minutes and streams continuously; a persistent server handles that naturally. The chat-revision subsystem's checkpoint forking (Section 5.16.4) has the same requirement — forking a branch is a stateful Postgres read/write followed by re-entering the graph, which is far more natural on a persistent process than on a cold FaaS invocation.
- **Function Compute (serverless).** Cheaper at idle, but **WebSocket and long-running graph execution are awkward on FaaS** — function timeouts and the stateless execution model fight both the multi-minute pipeline and the persistent stream. Function Compute is appropriate only for **stateless helper endpoints** (e.g., a thumbnail generator or a webhook receiver), not the orchestrator itself.

**Recommendation: ECS for the orchestrator**, specifically because of the long-lived WebSocket streaming, the multi-minute checkpointed pipeline execution, and now the stateful branch-forking the chat-revision subsystem depends on.

### 9.2 Qwen Cloud / DashScope — the model plane

**Every** LLM (Concept, Critic Chain, Meta-Critic, Treatment, Shot-List, Edit Router, Edit Interpreter), **vision** (Product Truth Extractor and Continuity via Qwen-VL), and **speech** (Voiceover via Qwen TTS/CosyVoice) call goes through **Qwen Cloud / DashScope's OpenAI-compatible API endpoint.** For the hackathon this must be **visibly, actually called in the codebase** — not merely referenced in docs. The submission includes a **recorded clip plus a linked code file demonstrating an actual Alibaba Cloud service call**, which is an explicit submission requirement. Because every intelligent node — including both new agents and the chat-revision subsystem — is a DashScope call, this requirement is satisfied pervasively rather than in a single token integration point.

### 9.3 Storage — OSS

Alibaba Cloud **Object Storage (OSS)** holds all binary assets: the seller's **product photos**, each **per-shot generated video clip**, the assembled **master cut**, and the **three aspect-ratio exports** (9:16 / 1:1 / 16:9). It also caches demo assets for the pre-warmed safety-net run. A chat edit that only touches copy or CTA text (Section 5.16.1) never writes a new OSS object at all — untouched clips are referenced, not re-uploaded. Structured state never lives in OSS — only blobs, referenced by URI from the DB.

### 9.4 Database — managed Postgres

The **managed Postgres-compatible DB (PolarDB or RDS for PostgreSQL)** holds all structured job and agent state from Section 7: jobs, seller direction, product truths, budget ledger, script variants, treatments, shot lists, generated-asset records, human-review events, chat-edit requests, job versions, and the LangGraph checkpoint tables. One instance, one connection pool, no second data store introduced for either extension.

### 9.5 Realtime — WebSocket over `astream_events`

A **FastAPI WebSocket endpoint** is fed by LangGraph's **`astream_events`**, pushing **budget-ledger updates, the critic reasoning trace, continuity drift scores, and now edit-router decisions and preview diffs** to the frontend **live during a run.** This is what makes the autonomous pipeline legible in the demo — judges watch the negotiation, the spend, and (in an extended demo) a live chat edit happen in real time.

### 9.6 Secrets & Configuration

All credentials — the **DashScope API key**, **video-gen (Wan/HappyHorse) API credentials**, the **DB connection string**, and **OSS access keys** — are injected via **Alibaba Cloud's secret/config management**, **never hardcoded** in the repository. This keeps the public GitHub repo (a submission requirement) free of live credentials while the deployed ECS instance receives them at runtime. No new secrets are introduced by either extension.

---

## 10. Judging Criteria Alignment

The hackathon weights four criteria. Below, each of ProductCut's features maps explicitly to the criterion it serves, so the demo walkthrough can point at concrete evidence for every point.

| Criterion | Weight | ProductCut features that satisfy it |
|---|---|---|
| **Technical Depth & Engineering** | **30%** | LangGraph DAG with a **bounded conditional retry loop** (Continuity → Video-Gen, capped at 2); **parallel fan-out via `Send()`**; **deterministic Budget Gate** with a hard cap and single reduce-loop; **checkpointer-backed resume** after crash; genuine **`interrupt()` pause/resume** human-in-the-loop; a **deterministic Justification Validator** that mechanically checks LLM output against source text before it's accepted; **checkpoint-fork-based scoped re-execution** for chat edits (re-running only downstream nodes, not the whole graph); deterministic ffmpeg Assembly and multi-format Export; clean split of relational state (Postgres) vs. blobs (OSS) |
| **Innovation & AI Creativity** | **30%** | The **Critic Chain** — four parallel specialist checkers reconciled by a **Meta-Critic that cross-pollinates** the best hook + body + CTA across variants; **constraint-enforced script diversity**; a **Product Truth Extractor** that grounds every downstream agent in specific, checkable product facts instead of category assumptions; a **Treatment Agent** that reasons from narrative-beat function to camera grammar (not product category to camera grammar), modeled on a real director's treatment; a **justification-forced shot schema** that structurally blocks template reuse; a **chat-based revision subsystem** (Edit Router + Edit Interpreter + Preview/Confirm) that performs surgical, cost-aware re-generation instead of a blind full re-run |
| **Problem Value & Impact** | **25%** | A **named niche** (Etsy/Shopify sellers) with a real cost-savings story ($300–$1,500 studio ads → automated); output in **three ready-to-post aspect ratios**; **graceful degradation** (Ken-Burns fallback) so a seller always gets a finished ad; a **live cost dashboard** that makes spend transparent and bounded; a **post-generation chat revision** feature that mirrors how a real seller would actually work with a freelance editor ("make the hook punchier") without paying for a full re-shoot |
| **Presentation & Documentation** | **15%** | This complete technical document; the **mermaid architecture diagram**; the **live-streaming dashboard** (budget ledger, critic reasoning trace, drift scores, edit-router decisions) that makes the autonomous decisions watchable in real time; the closing **transparency breakdown** (four scripts, all critic scores, merge justification, director's treatment, per-shot justifications, ledger, drift scores) surfaced to the frontend; a **diff-style preview** before any chat-driven re-render |

**Cross-cutting note on Qwen Cloud usage.** Because every reasoning, vision, and speech decision routes through Qwen via DashScope — including the two new agents and the chat-revision subsystem — the "native Qwen Cloud usage" story is not confined to one integration point — it is exercised on essentially every intelligent node in the graph, and the LangGraph trace makes each call visible for judging.
