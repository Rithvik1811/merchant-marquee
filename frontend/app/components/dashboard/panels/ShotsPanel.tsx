"use client";

import type { CSSProperties } from "react";
import type { Shot, ShotStatus } from "@/lib/types";
import { PanelHead, panelStyle, PanelRow } from "../shared";

interface ShotsPanelProps {
  shots: Shot[];
  shotOpenId: string | null;
  onToggle: (id: string) => void;
  showConnector: boolean;
}

function statusMeta(status: ShotStatus | undefined) {
  if (status === "done") return { label: "done", color: "var(--accent-ink)", bg: "var(--accent)" };
  if (status === "fallback") return { label: "fallback", color: "var(--accent-ink)", bg: "var(--tan)" };
  if (status === "generating") return { label: "generating", color: "var(--ink)", bg: "var(--surface2)" };
  if (status === "retrying") return { label: "retry 3/3", color: "var(--accent-ink)", bg: "var(--warn)" };
  return { label: "queued", color: "var(--muted)", bg: "transparent" };
}

export default function ShotsPanel({ shots, shotOpenId, onToggle, showConnector }: ShotsPanelProps) {
  const shotsDone = shots.filter((x) => x.status === "done" || x.status === "fallback").length;

  return (
    <PanelRow showConnector={showConnector}>
      <div style={panelStyle}>
        <PanelHead tag="Shot Generator" title="Shot generation" pill={`${shotsDone} / ${shots.length} done`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {shots.map((sh) => {
            const m = statusMeta(sh.status);
            const isFallback = sh.status === "fallback";
            const isReal = sh.status === "done";
            const isGenerating = sh.status === "generating" || sh.status === "retrying";
            const open = shotOpenId === sh.id;
            const thumbBg: CSSProperties = isFallback
              ? { backgroundImage: "repeating-linear-gradient(45deg, var(--tan) 0 8px, var(--surface2) 8px 16px)" }
              : isReal
                ? { background: "var(--accent)" }
                : { backgroundImage: "repeating-linear-gradient(135deg, var(--surface2) 0 10px, var(--bg) 10px 20px)" };

            return (
              <div
                key={sh.id}
                onClick={() => onToggle(sh.id)}
                style={{
                  border: `1px solid ${isFallback ? "var(--tan)" : "var(--line-strong)"}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "var(--bg)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16/10",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderBottom: "1px solid var(--line)",
                    ...thumbBg,
                  }}
                >
                  {isGenerating && (
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "2.5px solid var(--line)",
                        borderTopColor: "var(--tan)",
                        display: "block",
                        animation: "pc-spin 0.75s linear infinite",
                      }}
                    />
                  )}
                  {isFallback && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9.5px",
                        letterSpacing: "0.5px",
                        color: "var(--accent-ink)",
                        background: "var(--tan)",
                        padding: "3px 7px",
                        borderRadius: 5,
                        position: "absolute",
                        top: 8,
                        left: 8,
                      }}
                    >
                      KEN-BURNS
                    </span>
                  )}
                  {isReal && (
                    <span
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: "8px solid transparent",
                        borderBottom: "8px solid transparent",
                        borderLeft: "13px solid var(--bg)",
                        marginLeft: 3,
                      }}
                    />
                  )}
                </div>
                <div style={{ padding: "11px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{sh.label}</span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9.5px",
                        letterSpacing: "0.4px",
                        textTransform: "uppercase",
                        padding: "3px 7px",
                        borderRadius: 5,
                        color: m.color,
                        background: m.bg,
                        border: m.bg === "transparent" ? "1px solid var(--line-strong)" : "none",
                      }}
                    >
                      {m.label}
                    </span>
                  </div>
                  {open && (
                    <div
                      style={{
                        marginTop: 9,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--muted)",
                      }}
                    >
                      <span>lens · {sh.camera}</span>
                      <span>move · {sh.move}</span>
                      <span>len · {sh.duration}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
          Tap a shot for camera details. <span style={{ color: "var(--tan)" }}>Ken-Burns</span> = graceful fallback
          (still-image pan), not a generated clip.
        </div>
      </div>
    </PanelRow>
  );
}
