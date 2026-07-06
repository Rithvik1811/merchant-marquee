"use client";

import type { Treatment, Truth } from "@/lib/types";
import { categoryLabel, PanelHead, panelStyle, PanelRow } from "../shared";

interface TreatmentPanelProps {
  treatment: Treatment;
  truths: Truth[];
  hoveredTruthId: string | null;
  onHoverTruth: (id: string | null) => void;
  showConnector: boolean;
}

export default function TreatmentPanel({
  treatment,
  truths,
  hoveredTruthId,
  onHoverTruth,
  showConnector,
}: TreatmentPanelProps) {
  const infoCardStyle = { border: "1px solid var(--line)", borderRadius: 11, padding: 14, background: "var(--bg)" };
  const infoLabelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.6px",
    textTransform: "uppercase" as const,
    color: "var(--tan)",
    marginBottom: 7,
  };

  return (
    <PanelRow showConnector={showConnector}>
      <div style={panelStyle}>
        <PanelHead tag="Director" title="Director's treatment" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          <div style={infoCardStyle}>
            <div style={infoLabelStyle}>Persona</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{treatment.director_persona}</p>
          </div>
          <div style={infoCardStyle}>
            <div style={infoLabelStyle}>Color story</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{treatment.color_story}</p>
          </div>
          <div style={infoCardStyle}>
            <div style={infoLabelStyle}>Pacing</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{treatment.pacing_philosophy}</p>
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 12,
          }}
        >
          Beat-by-beat · hover a beat to trace its truth
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {treatment.beats.map((beat) => {
            const truth = truths.find((t) => t.id === beat.truth_fact_id);
            const label = truth ? categoryLabel(truth.category) : beat.truth_fact_id;
            const activeLink = hoveredTruthId === beat.truth_fact_id;
            return (
              <div
                key={beat.id}
                onMouseEnter={() => onHoverTruth(beat.truth_fact_id)}
                onMouseLeave={() => onHoverTruth(null)}
                style={{
                  border: `1px solid ${activeLink ? "var(--tan)" : "var(--line)"}`,
                  borderRadius: 11,
                  padding: "13px 15px",
                  background: activeLink ? "var(--surface2)" : "var(--bg)",
                  transition: "all .2s",
                  cursor: "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink)" }}>
                    &quot;{beat.script_quote}&quot;
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10.5px",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      color: activeLink ? "var(--tan)" : "var(--ink-soft)",
                    }}
                  >
                    ◆ {label}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.5, color: "var(--ink-soft)" }}>
                  {beat.why_not_generic}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </PanelRow>
  );
}
