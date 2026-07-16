import type { CSSProperties } from "react";

// Converts a "prop: value; prop2: value2;" CSS string into a React style object.
// Used for the many state-dependent styles that are naturally built as strings
// (bar widths, conditional colors, etc.) rather than as static style objects.
export function css(text: string): CSSProperties {
  const out: Record<string, string> = {};
  text.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val;
  });
  return out as CSSProperties;
}
