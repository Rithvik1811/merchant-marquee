"use client";

import { PRODUCT } from "@/lib/mockData";
import type {
  Budget,
  Final,
  Interrupt,
  InterruptResolution,
  MergeValidation,
  Script,
  Shot,
  Treatment,
  Truth,
} from "@/lib/types";
import { PHASES } from "@/lib/mockStream";
import BudgetPanel from "./panels/BudgetPanel";
import ContinuityPanel from "./panels/ContinuityPanel";
import FinalPanel from "./panels/FinalPanel";
import ScriptsPanel from "./panels/ScriptsPanel";
import ShotsPanel from "./panels/ShotsPanel";
import TreatmentPanel from "./panels/TreatmentPanel";
import TruthsPanel from "./panels/TruthsPanel";

export interface DashboardProps {
  phase: string;
  phaseLabel: string;
  elapsed: number;
  jobDone: boolean;
  onResetPipeline: () => void;

  truths: Truth[];
  hoveredTruthId: string | null;
  onHoverTruth: (id: string | null) => void;

  scripts: Script[];
  activeScriptId: string | null;
  winnerId: string | null;
  merge: MergeValidation | null;
  onSelectScript: (id: string) => void;

  treatment: Treatment | null;

  budget: Budget & { running: number };
  budgetOpenId: string | null;
  onToggleBudgetRow: (id: string) => void;

  shots: Shot[];
  shotOpenId: string | null;
  onToggleShot: (id: string) => void;

  drift: Record<string, number>;
  driftThreshold: number;
  interrupt: Interrupt | null;
  interruptResolution: InterruptResolution | null;
  onApprove: () => void;
  onRetry: () => void;
  onFallback: () => void;

  final: Final | null;
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function Dashboard(props: DashboardProps) {
  const {
    phase,
    phaseLabel,
    elapsed,
    jobDone,
    onResetPipeline,
    truths,
    hoveredTruthId,
    onHoverTruth,
    scripts,
    activeScriptId,
    winnerId,
    merge,
    onSelectScript,
    treatment,
    budget,
    budgetOpenId,
    onToggleBudgetRow,
    shots,
    shotOpenId,
    onToggleShot,
    drift,
    driftThreshold,
    interrupt,
    interruptResolution,
    onApprove,
    onRetry,
    onFallback,
    final,
  } = props;

  const curPhaseIdx = PHASES.indexOf(phase);
  const jobStatusLine = jobDone ? `Job complete · ${truths.length} truths · winning cut delivered` : phaseLabel || "Starting…";

  const hasTruths = truths.length > 0;
  const hasScripts = scripts.length > 0;
  const hasTreatment = !!treatment;
  const hasBudget = budget.shots.length > 0;
  const hasShots = shots.length > 0;
  const hasInterrupt = !!interrupt;
  const hasDriftPanel = hasInterrupt || Object.keys(drift).length > 0 || !!interruptResolution;
  const hasFinal = !!final;

  return (
    <div>
      <div
        style={{
          position: "sticky",
          top: 67,
          zIndex: 20,
          background: "var(--bg)",
          borderBottom: "1px solid var(--line-strong)",
          padding: "14px 40px",
        }}
      >
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                flex: "0 0 auto",
                background: "var(--tan)",
                animation: jobDone ? undefined : "pc-pulse 1.2s ease infinite",
              }}
            />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{PRODUCT.name}</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                {jobStatusLine}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {PHASES.map((p, i) => {
              const done = jobDone || i < curPhaseIdx;
              const active = !jobDone && i === curPhaseIdx;
              return (
                <span
                  key={p}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    padding: "4px 9px",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                    ...(active
                      ? { background: "var(--tan)", color: "var(--accent-ink)", fontWeight: 700 }
                      : done
                        ? { background: "var(--surface2)", color: "var(--ink-soft)" }
                        : { background: "transparent", color: "var(--muted)", opacity: 0.55, border: "1px solid var(--line)" }),
                  }}
                >
                  {p}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-soft)" }}>
              {formatElapsed(elapsed)}
            </span>
            <button
              onClick={onResetPipeline}
              className="pc-hoverable"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12.5px",
                fontWeight: 600,
                padding: "8px 14px",
                border: "1px solid var(--line-strong)",
                background: "transparent",
                color: "var(--ink)",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              New job
            </button>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 40px 90px" }}>
        {hasTruths && (
          <TruthsPanel truths={truths} hoveredTruthId={hoveredTruthId} onHoverTruth={onHoverTruth} showConnector={hasScripts} />
        )}

        {hasScripts && (
          <ScriptsPanel
            scripts={scripts}
            activeScriptId={activeScriptId}
            winnerId={winnerId}
            merge={merge}
            onSelectScript={onSelectScript}
            showConnector={hasTreatment}
          />
        )}

        {treatment && (
          <TreatmentPanel
            treatment={treatment}
            truths={truths}
            hoveredTruthId={hoveredTruthId}
            onHoverTruth={onHoverTruth}
            showConnector={hasBudget}
          />
        )}

        {hasBudget && (
          <BudgetPanel budget={budget} budgetOpenId={budgetOpenId} onToggle={onToggleBudgetRow} showConnector={hasShots} />
        )}

        {hasShots && (
          <ShotsPanel shots={shots} shotOpenId={shotOpenId} onToggle={onToggleShot} showConnector={hasDriftPanel} />
        )}

        {hasDriftPanel && (
          <ContinuityPanel
            shots={shots}
            drift={drift}
            driftThreshold={driftThreshold}
            interrupt={interrupt}
            interruptResolution={interruptResolution}
            onApprove={onApprove}
            onRetry={onRetry}
            onFallback={onFallback}
            showConnector={hasFinal}
          />
        )}

        {final && <FinalPanel final={final} />}
      </main>
    </div>
  );
}
