"use client";

import type { Budget } from "@/lib/types";
import { PanelHead, panelStyle, PanelRow } from "../shared";

interface BudgetPanelProps {
  budget: Budget & { running: number };
  budgetOpenId: string | null;
  onToggle: (id: string) => void;
  showConnector: boolean;
}

export default function BudgetPanel({ budget, budgetOpenId, onToggle, showConnector }: BudgetPanelProps) {
  const bCap = budget.cap || 1;
  const bRun = budget.running;
  const bPct = Math.min(bRun / bCap, 1) * 100;
  const overRatio = bRun / bCap;
  const budgetColor = overRatio > 1 ? "var(--over)" : overRatio > 0.85 ? "var(--warn)" : "var(--accent)";
  const budgetStateLabel = overRatio > 1 ? "OVER CAP" : overRatio > 0.85 ? "Approaching cap" : "Within budget";

  return (
    <PanelRow showConnector={showConnector}>
      <div style={panelStyle}>
        <PanelHead
          tag="Producer"
          title="Budget ledger"
          pill={`${bRun} / ${budget.cap || 0} ${budget.unit || ""}`}
          pillColor={budgetColor}
        />
        <div
          style={{
            height: 12,
            borderRadius: 999,
            background: "var(--surface2)",
            overflow: "hidden",
            position: "relative",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${bPct}%`,
              background: budgetColor,
              borderRadius: 999,
              transition: "width .5s ease",
            }}
          />
          <div style={{ position: "absolute", top: -3, bottom: -3, left: "100%", width: 2, background: "var(--ink)", opacity: 0.5 }} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            color: "var(--muted)",
            marginBottom: 16,
          }}
        >
          <span>{budgetStateLabel}</span>
          <span>cap {(budget.cap || 0) + " " + (budget.unit || "")}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {budget.shots.map((sh) => {
            const open = budgetOpenId === sh.id;
            const barWidth = Math.min((sh.alloc / bCap) * 100 * 3, 100);
            return (
              <div
                key={sh.id}
                onClick={() => onToggle(sh.id)}
                style={{ padding: "11px 2px", borderTop: "1px solid var(--line)", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "13.5px", color: "var(--ink)", flex: 1 }}>{sh.label}</span>
                  <div style={{ width: 120, height: 6, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${barWidth}%`, background: "var(--tan)", borderRadius: 999 }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-soft)", minWidth: 30, textAlign: "right" }}>
                    {sh.alloc}
                  </span>
                </div>
                {open && (
                  <p style={{ margin: "8px 0 2px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--muted)" }}>
                    {sh.justification}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PanelRow>
  );
}
