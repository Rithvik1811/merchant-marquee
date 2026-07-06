"use client";

import type { Truth } from "@/lib/types";
import { categoryLabel, markerStyle, PanelHead, panelStyle, PanelRow } from "../shared";

interface TruthsPanelProps {
  truths: Truth[];
  hoveredTruthId: string | null;
  onHoverTruth: (id: string | null) => void;
  showConnector: boolean;
}

export default function TruthsPanel({ truths, hoveredTruthId, onHoverTruth, showConnector }: TruthsPanelProps) {
  return (
    <PanelRow showConnector={showConnector}>
      <div style={panelStyle}>
        <PanelHead tag="Truth Agent" title="Product truths" pill={`${truths.length} facts`} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {truths.map((truth, i) => (
            <div
              key={truth.id}
              onMouseEnter={() => onHoverTruth(truth.id)}
              onMouseLeave={() => onHoverTruth(null)}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: "13px 10px",
                borderTop: i === 0 ? "0" : "1px solid var(--line)",
                borderRadius: 8,
                transition: "background-color .2s",
                background: hoveredTruthId === truth.id ? "var(--surface2)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 128 }}>
                <span style={markerStyle(truth.category)} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    letterSpacing: "0.9px",
                    textTransform: "uppercase",
                    color: "var(--ink-soft)",
                  }}
                >
                  {categoryLabel(truth.category)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "14.5px", lineHeight: 1.5, color: "var(--ink)" }}>{truth.fact_text}</p>
            </div>
          ))}
        </div>
      </div>
    </PanelRow>
  );
}
