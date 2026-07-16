// ProductCut — mock event stream.
// Mirrors the real backend WebSocket: subscribe with .on(handler), then .start().
// To go live, replace createMockJob() with a thin wrapper around a real WebSocket
// that forwards socket.onmessage -> handler({ type, payload }). Nothing else changes.

import {
  BUDGET,
  DRIFT,
  FINAL,
  INTERRUPT,
  MERGE_VALIDATION,
  PRODUCT,
  SCRIPTS,
  SHOTS,
  TREATMENT,
  TRUTHS,
  WINNER_ID,
} from "./mockData";
import type { InterruptResolution, JobEvent, MockJob, ShotStatus } from "./types";

// Ordered phases for the pipeline tracker.
export const PHASES = ["Ingest", "Truths", "Scripts", "Treatment", "Budget", "Shots", "Continuity", "Delivery"];

interface ScriptedEvent {
  gap: number;
  type: JobEvent["type"];
  payload: JobEvent["payload"];
}

// Build the scripted event list. `gap` = ms to wait AFTER the previous event.
function buildScript(): ScriptedEvent[] {
  const ev: ScriptedEvent[] = [];
  const push = (gap: number, type: JobEvent["type"], payload: JobEvent["payload"]) =>
    ev.push({ gap, type, payload });

  push(400, "node_started", { phase: "Ingest", label: "Ingesting brief + photos" });
  push(700, "node_started", { phase: "Truths", label: "Extracting product truths" });
  TRUTHS.forEach((t, i) => push(650 + (i === 0 ? 200 : 0), "truth_extracted", { truth: t }));

  push(700, "node_started", { phase: "Scripts", label: "Writing + scoring script variants" });
  SCRIPTS.forEach((s, i) => push(900, "critic_score", { script: s, index: i, total: SCRIPTS.length }));
  push(700, "critic_done", { winnerId: WINNER_ID, merge: MERGE_VALIDATION });

  push(800, "node_started", { phase: "Treatment", label: "Directing the treatment" });
  push(900, "treatment_ready", { treatment: TREATMENT });

  push(700, "node_started", { phase: "Budget", label: "Allocating shot budget" });
  let running = 0;
  BUDGET.shots.forEach((sh, i) => {
    running += sh.alloc;
    push(500, "budget_updated", { shot: sh, running, cap: BUDGET.cap, unit: BUDGET.unit, index: i });
  });

  push(800, "node_started", { phase: "Shots", label: "Generating shots" });
  push(300, "shots_init", { shots: SHOTS.map((s) => ({ ...s, status: "queued" as ShotStatus })) });
  // Generate shots one by one: generating -> done, with a drift score after each.
  SHOTS.forEach((s) => {
    push(600, "shot_generated", { id: s.id, status: "generating" });
    if (s.id === INTERRUPT.shotId) {
      // this shot exhausts retries -> interrupt (stream pauses here)
      push(1400, "shot_generated", { id: s.id, status: "retrying", attempt: 3 });
      push(700, "drift_scored", { shotId: s.id, score: DRIFT[s.id] });
      push(600, "interrupt_requested", { interrupt: INTERRUPT });
      // events after this run only once resume() is called
    } else {
      const status: ShotStatus = s.fallback ? "fallback" : "done";
      push(1100, "shot_generated", { id: s.id, status });
      push(400, "drift_scored", { shotId: s.id, score: DRIFT[s.id] });
    }
  });

  push(900, "node_started", { phase: "Continuity", label: "Final continuity pass" });
  push(1000, "node_started", { phase: "Delivery", label: "Rendering exports" });
  push(1200, "job_complete", { final: FINAL, product: PRODUCT });
  return ev;
}

export function createMockJob(): MockJob {
  const EVENTS = buildScript();
  let handlers: Array<(e: JobEvent) => void> = [];
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  let idx = 0;
  let paused = false;
  let stopped = false;

  function emit(e: JobEvent) {
    handlers.forEach((h) => {
      try {
        h(e);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function step() {
    if (stopped || idx >= EVENTS.length) return;
    const e = EVENTS[idx];
    const t = setTimeout(() => {
      if (stopped) return;
      emit({ type: e.type, payload: e.payload } as JobEvent);
      idx += 1;
      if (e.type === "interrupt_requested") {
        paused = true;
        return;
      } // wait for resume()
      step();
    }, e.gap);
    timers.push(t);
  }

  return {
    // WebSocket-shaped subscription
    on(handler) {
      handlers.push(handler);
      return () => {
        handlers = handlers.filter((h) => h !== handler);
      };
    },
    start() {
      idx = 0;
      stopped = false;
      paused = false;
      step();
    },
    // Called by the human-review interrupt UI. resolution: 'approve' | 'retry' | 'fallback'
    resume(resolution: InterruptResolution) {
      if (!paused) return;
      paused = false;
      const shot = INTERRUPT.shotId;
      const status: ShotStatus = resolution === "fallback" ? "fallback" : "done";
      emit({ type: "interrupt_resolved", payload: { shotId: shot, resolution, status } });
      emit({ type: "shot_generated", payload: { id: shot, status } });
      emit({
        type: "drift_scored",
        payload: { shotId: shot, score: resolution === "retry" ? 0.17 : DRIFT[shot] },
      });
      step();
    },
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
      timers = [];
    },
    get paused() {
      return paused;
    },
  };
}
