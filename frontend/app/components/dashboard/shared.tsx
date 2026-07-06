import type { CSSProperties, ReactNode } from "react";
import type { ScoreKey } from "@/lib/types";

export const SCORE_META: { key: ScoreKey; label: string; weight: string }[] = [
  { key: "hook", label: "Hook", weight: "25%" },
  { key: "pacing", label: "Pacing", weight: "20%" },
  { key: "completion", label: "Completion", weight: "20%" },
  { key: "cta", label: "CTA", weight: "20%" },
  { key: "tone", label: "Tone", weight: "15%" },
];

export const panelStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line-strong)",
  borderRadius: 16,
  padding: "22px 24px",
  boxShadow: "0 2px 4px var(--shadow), 0 14px 34px var(--shadow)",
  animation: "pc-panel-in 0.45s ease both",
};

export const panelHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 18,
  flexWrap: "wrap",
};

export const panelTagStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: "var(--tan)",
};

export const panelTitleStyle: CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontWeight: 500,
  fontSize: 24,
  margin: 0,
  flex: 1,
};

export const pillStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--accent-ink)",
  background: "var(--accent)",
  padding: "4px 9px",
  borderRadius: 6,
};

export const spineDotStyle: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "var(--tan)",
  margin: "26px auto 0",
  position: "relative",
  zIndex: 1,
  boxShadow: "0 0 0 4px var(--surface)",
};

export function connStyle(show: boolean): CSSProperties {
  return show
    ? { position: "absolute", left: 13, top: 38, bottom: 0, width: 2, background: "var(--line-strong)", zIndex: 0 }
    : { display: "none" };
}

interface PanelHeadProps {
  tag: string;
  title: string;
  pill?: string;
  pillColor?: string;
}

export function PanelHead({ tag, title, pill, pillColor }: PanelHeadProps) {
  return (
    <div style={panelHeadStyle}>
      <span style={panelTagStyle}>{tag}</span>
      <h2 style={panelTitleStyle}>{title}</h2>
      {pill != null && <span style={pillColor ? { ...pillStyle, background: pillColor } : pillStyle}>{pill}</span>}
    </div>
  );
}

interface PanelRowProps {
  showConnector: boolean;
  paddingBottom?: number;
  children: ReactNode;
}

// Mirrors the original grid: relative wrapper > [connector line, spine dot, panel card].
// The connector is absolutely positioned so it must stay first in DOM order relative to
// the grid's normal-flow children (spine dot, then panel) for the same visual alignment.
export function PanelRow({ showConnector, paddingBottom = 24, children }: PanelRowProps) {
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 22,
        paddingBottom,
      }}
    >
      <div style={connStyle(showConnector)} />
      <div style={spineDotStyle} />
      {children}
    </div>
  );
}

export type MarkerShape = "square" | "circle" | "diamond" | "ring" | "ringSquare" | "bar" | "triangle";

export const CATEGORY: Record<string, { label: string; shape: MarkerShape }> = {
  material: { label: "Material", shape: "square" },
  color: { label: "Color", shape: "circle" },
  texture: { label: "Texture", shape: "diamond" },
  distinguishing_mark: { label: "Mark", shape: "ring" },
  size: { label: "Size", shape: "bar" },
  condition: { label: "Condition", shape: "ringSquare" },
  shape: { label: "Shape", shape: "triangle" },
};

export function markerStyle(cat: string): CSSProperties {
  const shape = CATEGORY[cat]?.shape ?? "square";
  const base: CSSProperties = { display: "inline-block", flex: "0 0 auto", background: "var(--tan)", width: 9, height: 9 };
  switch (shape) {
    case "circle":
      return { ...base, borderRadius: "50%" };
    case "diamond":
      return { ...base, transform: "rotate(45deg)", borderRadius: 1 };
    case "ring":
      return { display: "inline-block", flex: "0 0 auto", width: 9, height: 9, border: "1.5px solid var(--tan)", borderRadius: "50%" };
    case "ringSquare":
      return { display: "inline-block", flex: "0 0 auto", width: 9, height: 9, border: "1.5px solid var(--tan)", borderRadius: 2 };
    case "bar":
      return { display: "inline-block", flex: "0 0 auto", width: 12, height: 4, background: "var(--tan)", borderRadius: 2 };
    case "triangle":
      return {
        display: "inline-block",
        flex: "0 0 auto",
        width: 10,
        height: 10,
        background: "var(--tan)",
        clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
      };
    default:
      return { ...base, borderRadius: 2 };
  }
}

export function categoryLabel(cat: string): string {
  return CATEGORY[cat]?.label ?? cat;
}
