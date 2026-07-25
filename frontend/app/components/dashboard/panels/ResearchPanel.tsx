"use client";

import type { Research } from "@/lib/types";
import { categoryLabel } from "../shared";

interface ResearchPanelProps {
  research: Research;
}

export default function ResearchPanel({ research }: ResearchPanelProps) {
  return (
    <section
      data-rid="section-pad"
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "56px 48px 52px",
        animation: "pc-section-in 0.6s var(--ease) both",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 36,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--faint)",
          }}
        >
          Research Agent — web specs &amp; audience context
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--faint)",
          }}
        >
          {research.factCount} {research.factCount === 1 ? "fact" : "facts"} extracted
        </span>
      </div>

      {/* Product name */}
      <div style={{ marginBottom: 32 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            display: "block",
            marginBottom: 8,
          }}
        >
          Identified as
        </span>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            lineHeight: 1.35,
            color: "var(--ink)",
          }}
        >
          {research.productName}
        </p>
      </div>

      {/* Queries */}
      <div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Web searches run
        </span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {research.queries.map((q, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 20,
                padding: "18px 0",
                borderTop: i === 0 ? "1px solid var(--hair-strong)" : "1px solid var(--hair)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 28,
                  color: "var(--faint)",
                  flex: "0 0 44px",
                  lineHeight: 1,
                  textAlign: "right",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                }}
              >
                {q}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Research facts */}
      {research.facts && research.facts.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 4,
            }}
          >
            What we found
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {research.facts.map((fact, i) => (
              <div
                key={fact.fact_id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 20,
                  padding: "18px 0",
                  borderTop: i === 0 ? "1px solid var(--hair-strong)" : "1px solid var(--hair)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    fontSize: 28,
                    color: "var(--faint)",
                    flex: "0 0 44px",
                    lineHeight: 1,
                    textAlign: "right",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--faint)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    {categoryLabel(fact.category)}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      color: "var(--ink-soft)",
                      lineHeight: 1.55,
                    }}
                  >
                    {fact.claim}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
