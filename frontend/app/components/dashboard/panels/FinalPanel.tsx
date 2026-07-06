"use client";

import type { Final } from "@/lib/types";
import { PanelHead, panelStyle, PanelRow } from "../shared";

interface FinalPanelProps {
  final: Final;
}

export default function FinalPanel({ final }: FinalPanelProps) {
  const maxH = 76;
  const ratioTiles = final.ratios.map((r) => {
    const ratio = r.w / r.h;
    const w = ratio >= 1 ? maxH : maxH * ratio;
    const h = ratio >= 1 ? maxH / ratio : maxH;
    return { ...r, frameW: Math.round(w), frameH: Math.round(h) };
  });

  return (
    <PanelRow showConnector={false} paddingBottom={8}>
      <div style={panelStyle}>
        <PanelHead tag="Delivery" title="Your ad is ready" pill={final.duration} />
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 13,
            overflow: "hidden",
            marginBottom: 18,
            backgroundImage: "repeating-linear-gradient(135deg, var(--surface2) 0 12px, var(--bg) 12px 24px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--line-strong)",
          }}
        >
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: "50%",
              background: "var(--tan)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px var(--shadow)",
            }}
          >
            <span
              style={{
                width: 0,
                height: 0,
                borderTop: "12px solid transparent",
                borderBottom: "12px solid transparent",
                borderLeft: "19px solid var(--accent-ink)",
                marginLeft: 5,
              }}
            />
          </div>
          <span style={{ position: "absolute", bottom: 12, left: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            preview · master.mp4
          </span>
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
          Exports · three aspect ratios
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {ratioTiles.map((tile) => (
            <div
              key={tile.id}
              style={{
                border: "1px solid var(--line-strong)",
                borderRadius: 12,
                padding: 14,
                background: "var(--bg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: tile.frameW,
                  height: tile.frameH,
                  borderRadius: 7,
                  backgroundImage: "repeating-linear-gradient(135deg, var(--surface2) 0 9px, var(--bg) 9px 18px)",
                  border: "1px solid var(--line-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{tile.id}</span>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>{tile.label}</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 2 }}>{tile.use}</div>
              </div>
              <button
                className="pc-hoverable"
                style={{
                  width: "100%",
                  fontFamily: "var(--font-sans)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  padding: 9,
                  border: "1px solid var(--line-strong)",
                  background: "transparent",
                  color: "var(--ink)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                ↓ Download {tile.id}
              </button>
            </div>
          ))}
        </div>
      </div>
    </PanelRow>
  );
}
