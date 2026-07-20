"use client";

import { useState } from "react";
import type { HistoryEntry } from "@/lib/types";

interface LibraryProps {
  history: HistoryEntry[];
  onClose: () => void;
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
}

export default function Library({ history, onClose, onOpen, onDelete }: LibraryProps) {
  // Two-step inline confirm: first click arms the row, second click (within
  // the same row) actually deletes. Keyed by job identity so only one row is
  // ever armed at a time and switching rows re-arms cleanly.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  return (
    <main style={{ maxWidth: 1020, margin: "0 auto", padding: "56px 56px 90px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 44 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400, fontSize: "clamp(32px, 4.4vw, 48px)", margin: 0 }}>
          My ads
        </h1>
        <button
          onClick={onClose}
          className="pcs-hover-ink"
          style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", background: "transparent", border: "none", borderBottom: "1px solid var(--hair-strong)", cursor: "pointer", padding: "2px 0" }}
        >
          ← Back
        </button>
      </div>

      {history.length === 0 && (
        <p style={{ fontSize: "14.5px", color: "var(--ink-soft)", fontStyle: "italic" }}>
          No finished ads yet — completed jobs will show up here.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {history.map((job, i) => {
          const key = job.jobId ?? `${job.productName}-${job.date}-${i}`;
          const armed = pendingKey === key;
          return (
            <div
              key={key}
              data-rid="library-row"
              onClick={() => onOpen(job)}
              style={{ display: "grid", gridTemplateColumns: "84px 1fr auto auto", gap: 20, alignItems: "center", padding: "18px 4px", borderTop: "1px solid var(--hair)", cursor: "pointer" }}
            >
              <div style={{ width: 84, aspectRatio: "16 / 9", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "10px solid var(--accent)", marginLeft: 2 }} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 18, color: "var(--ink)" }}>{job.productName}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--faint)", marginTop: 3 }}>
                  {new Date(job.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {job.truths.length} facts
                  {job.final ? ` · ${job.final.duration}` : ""}
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--accent)" }}>View →</span>
              {armed ? (
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setPendingKey(null); onDelete(job); }}
                    style={{ fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, padding: "6px 10px", border: "1px solid var(--over, #c0392b)", background: "var(--over, #c0392b)", color: "#fff", cursor: "pointer" }}
                  >
                    Confirm delete
                  </button>
                  <button
                    onClick={() => setPendingKey(null)}
                    className="pcs-hover-ink"
                    style={{ fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, padding: "6px 10px", border: "1px solid var(--hair-strong)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingKey(key); }}
                  className="pcs-hover-ink"
                  aria-label={`Delete ${job.productName}`}
                  title="Delete this ad"
                  style={{ fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, padding: "6px 10px", border: "1px solid var(--hair-strong)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer" }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
