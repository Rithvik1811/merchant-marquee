"use client";

import type { MergeValidation, Script } from "@/lib/types";
import { PanelHead, panelStyle, PanelRow, SCORE_META } from "../shared";

interface ScriptsPanelProps {
  scripts: Script[];
  activeScriptId: string | null;
  winnerId: string | null;
  merge: MergeValidation | null;
  onSelectScript: (id: string) => void;
  showConnector: boolean;
}

export default function ScriptsPanel({
  scripts,
  activeScriptId,
  winnerId,
  merge,
  onSelectScript,
  showConnector,
}: ScriptsPanelProps) {
  const activeId = activeScriptId || scripts[0]?.id;
  const activeScript = scripts.find((x) => x.id === activeId) || scripts[0] || null;
  const winner = scripts.find((x) => x.id === winnerId);

  return (
    <PanelRow showConnector={showConnector}>
      <div style={panelStyle}>
        <PanelHead tag="Scriptwriter + Critic" title="Script variants & scores" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {scripts.map((sc) => (
            <button
              key={sc.id}
              onClick={() => onSelectScript(sc.id)}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 13px",
                borderRadius: 9,
                cursor: "pointer",
                border: `1px solid ${sc.id === activeId ? "var(--tan)" : "var(--line-strong)"}`,
                background: sc.id === activeId ? "var(--surface2)" : "transparent",
                color: "var(--ink)",
              }}
            >
              {sc.title} <span style={{ opacity: 0.7 }}>· {sc.total}</span>
              {sc.winner && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8.5px",
                    letterSpacing: "0.5px",
                    marginLeft: 6,
                    padding: "2px 5px",
                    borderRadius: 4,
                    background: "var(--tan)",
                    color: "var(--accent-ink)",
                  }}
                >
                  WIN
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
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
              Score breakdown · total {activeScript ? activeScript.total : ""}
            </div>
            {activeScript &&
              SCORE_META.map((m) => (
                <div key={m.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: 5 }}>
                    <span style={{ color: "var(--ink)" }}>
                      {m.label}{" "}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>
                        {m.weight}
                      </span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
                      {activeScript.scores[m.key]}
                    </span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${activeScript.scores[m.key]}%`,
                        background: "var(--tan)",
                        borderRadius: 999,
                        transition: "width .5s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
          <div>
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
              Reasoning trace
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "13.5px", lineHeight: 1.6, color: "var(--ink-soft)" }}>
              {activeScript ? activeScript.reasoning : ""}
            </p>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10.5px",
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 8,
              }}
            >
              Lines
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeScript?.lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 15,
                    color: "var(--ink)",
                    paddingLeft: 12,
                    borderLeft: "2px solid var(--line-strong)",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        {merge && (
          <>
            <div style={{ marginTop: 20, border: "1px solid var(--line-strong)", borderRadius: 12, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "var(--surface2)",
                  borderBottom: "1px solid var(--line-strong)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.8px",
                    padding: "3px 8px",
                    borderRadius: 5,
                    background: merge.status === "pass" ? "var(--tan)" : "var(--over)",
                    color: "var(--accent-ink)",
                  }}
                >
                  {merge.status.toUpperCase()}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.6px",
                    textTransform: "uppercase",
                    color: "var(--ink)",
                  }}
                >
                  Merge validation · {merge.repairPath}
                </span>
              </div>
              <div style={{ padding: 16 }}>
                <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)" }}>
                  {merge.note}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 12, background: "var(--bg)" }}>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.6px",
                        textTransform: "uppercase",
                        color: "var(--over)",
                        marginBottom: 7,
                      }}
                    >
                      Before · {merge.seam.location}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{merge.seam.before}</p>
                  </div>
                  <div style={{ border: "1px solid var(--tan)", borderRadius: 9, padding: 12, background: "var(--bg)" }}>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.6px",
                        textTransform: "uppercase",
                        color: "var(--tan)",
                        marginBottom: 7,
                      }}
                    >
                      After · copy-edit
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>{merge.seam.after}</p>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                  Meta-Critic swap: {merge.metaCriticSwapFired ? "FIRED" : "not required"}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, padding: "18px 20px", borderRadius: 12, background: "var(--accent)", color: "var(--accent-ink)" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  opacity: 0.85,
                  marginBottom: 8,
                }}
              >
                Winning script · {winner ? winner.title : ""} · {winner ? winner.total : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {winner?.lines.map((line, i) => (
                  <div key={i} style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PanelRow>
  );
}
