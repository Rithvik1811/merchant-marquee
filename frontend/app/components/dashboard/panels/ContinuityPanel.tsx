"use client";

import type { Interrupt, InterruptResolution, Shot } from "@/lib/types";
import { PanelHead, panelStyle, PanelRow } from "../shared";

interface ContinuityPanelProps {
  shots: Shot[];
  drift: Record<string, number>;
  driftThreshold: number;
  interrupt: Interrupt | null;
  interruptResolution: InterruptResolution | null;
  onApprove: () => void;
  onRetry: () => void;
  onFallback: () => void;
  showConnector: boolean;
}

const candThumbStyle = {
  width: "100%",
  aspectRatio: "1/1",
  backgroundImage: "repeating-linear-gradient(135deg, var(--surface2) 0 8px, var(--bg) 8px 16px)",
};

const actionBtnBase = {
  fontFamily: "var(--font-sans)",
  fontSize: "13.5px",
  fontWeight: 600,
  padding: "11px 20px",
  border: "1px solid var(--line-strong)",
  background: "transparent",
  color: "var(--ink)",
  borderRadius: 9,
  cursor: "pointer",
};

export default function ContinuityPanel({
  shots,
  drift,
  driftThreshold,
  interrupt,
  interruptResolution,
  onApprove,
  onRetry,
  onFallback,
  showConnector,
}: ContinuityPanelProps) {
  const driftRows = shots
    .filter((sh) => drift[sh.id] != null)
    .map((sh) => {
      const score = drift[sh.id];
      const ok = score <= driftThreshold;
      return { id: sh.id, label: sh.label, score, ok };
    });
  const interruptResolvedShown = !!interruptResolution && !interrupt;

  return (
    <PanelRow showConnector={showConnector}>
      <div style={panelStyle}>
        <PanelHead tag="Continuity Guard" title="Continuity & drift" />

        {interrupt && (
          <div
            style={{
              border: "1.5px solid var(--tan)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 18,
              animation: "pc-panel-in 0.4s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--tan)", color: "var(--accent-ink)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.8px", textTransform: "uppercase", fontWeight: 700 }}>
                ⚠ Human review needed
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                {interrupt.label} · drift {interrupt.driftScore.toFixed(2)}
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ margin: "0 0 14px", fontSize: "13.5px", lineHeight: 1.55, color: "var(--ink)" }}>{interrupt.reason}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {interrupt.candidates.map((c) => (
                  <div key={c.id} style={{ border: "1px solid var(--line-strong)", borderRadius: 9, overflow: "hidden" }}>
                    <div style={candThumbStyle} />
                    <div style={{ padding: "8px 9px", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--muted)" }}>
                      {c.note}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={onApprove}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    padding: "11px 20px",
                    border: "none",
                    borderRadius: 9,
                    cursor: "pointer",
                    background: "var(--accent)",
                    color: "var(--accent-ink)",
                  }}
                >
                  Approve closest
                </button>
                <button onClick={onRetry} className="pc-hoverable" style={actionBtnBase}>
                  Retry with edit
                </button>
                <button onClick={onFallback} className="pc-hoverable" style={actionBtnBase}>
                  Accept Ken-Burns fallback
                </button>
              </div>
            </div>
          </div>
        )}

        {interruptResolvedShown && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--tan)", marginBottom: 14 }}>
            ✓ Review resolved — {interruptResolution}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          {driftRows.map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 2px", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: 13, color: "var(--ink)", flex: 1 }}>{row.label}</span>
              <div style={{ width: 160, height: 6, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min((row.score / 0.6) * 100, 100)}%`,
                    background: row.ok ? "var(--accent)" : "var(--over)",
                    borderRadius: 999,
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  minWidth: 34,
                  textAlign: "right",
                  color: row.ok ? "var(--ink-soft)" : "var(--over)",
                }}
              >
                {row.score.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
          Lower is better. Auto-accept threshold ≤ {driftThreshold.toFixed(2)}.
        </div>
      </div>
    </PanelRow>
  );
}
