"use client";

import type { ChangeEvent, KeyboardEvent } from "react";

interface BriefStepProps {
  brief: string;
  onBriefInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onBriefKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export default function BriefStep({ brief, onBriefInput, onBriefKey }: BriefStepProps) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--tan)",
          marginBottom: 10,
        }}
      >
        Step two
      </div>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize: "clamp(34px, 4.6vw, 50px)",
          lineHeight: 1.02,
          letterSpacing: "-1px",
          margin: "0 0 12px",
        }}
      >
        Sum it up in <em style={{ fontStyle: "italic", color: "var(--tan)" }}>one line</em>.
      </h1>
      <p style={{ margin: "0 0 30px", fontSize: 16, lineHeight: 1.55, color: "var(--ink-soft)", maxWidth: "46ch" }}>
        What is it, and what should the ad feel like? One honest sentence is plenty — we&apos;ll do the rest.
      </p>
      <input
        type="text"
        value={brief}
        onChange={onBriefInput}
        onKeyDown={onBriefKey}
        placeholder="handmade ceramic mugs, cozy autumn vibe"
        className="pc-input-brief"
        style={{
          width: "100%",
          padding: "24px 26px",
          fontFamily: "var(--font-serif)",
          fontSize: 28,
          lineHeight: 1.25,
          color: "var(--ink)",
          background: "var(--surface)",
          border: "1.5px solid var(--line-strong)",
          borderRadius: 16,
          boxShadow: "0 4px 14px var(--shadow)",
        }}
      />
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.5px", color: "var(--muted)", margin: "12px 2px 0" }}>
        e.g. &quot;small-batch soy candles, quiet Sunday mornings&quot;
      </p>
    </div>
  );
}
