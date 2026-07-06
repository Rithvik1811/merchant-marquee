"use client";

import type { Photo } from "./types";

interface SummaryStepProps {
  photos: Photo[];
  brief: string;
  moodWords: string[];
  refLink: string;
  neverList: string[];
  notes: string;
  onEditPhotos: () => void;
  onEditBrief: () => void;
  onEditDirection: () => void;
}

export default function SummaryStep({
  photos,
  brief,
  moodWords,
  refLink,
  neverList,
  notes,
  onEditPhotos,
  onEditBrief,
  onEditDirection,
}: SummaryStepProps) {
  const photoCountLabel = photos.length ? `${photos.length} / 3 added` : "up to 3";
  const hasMood = moodWords.length > 0;
  const hasRef = !!refLink.trim();
  const hasNever = neverList.length > 0;
  const hasNotes = !!notes.trim();
  const hasDirection = hasMood || hasRef || hasNever || hasNotes;

  const sectionHeadStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 };
  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.8px",
    textTransform: "uppercase" as const,
    color: "var(--muted)",
  };
  const editBtnStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--tan)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  };
  const directionRowLabel = { fontSize: "12.5px", color: "var(--muted)", minWidth: 74 };

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
        Review
      </div>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize: "clamp(34px, 4.6vw, 50px)",
          lineHeight: 1.02,
          letterSpacing: "-1px",
          margin: "0 0 28px",
        }}
      >
        Here&apos;s your <em style={{ fontStyle: "italic", color: "var(--tan)" }}>brief</em>.
      </h1>
      <div style={{ border: "1px solid var(--line-strong)", borderRadius: 16, background: "var(--surface)", overflow: "hidden" }}>
        <div style={{ padding: 22, borderBottom: "1px solid var(--line)" }}>
          <div style={{ ...sectionHeadStyle, marginBottom: 14 }}>
            <span style={labelStyle}>Photos · {photoCountLabel}</span>
            <button onClick={onEditPhotos} style={editBtnStyle}>
              Edit
            </button>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {photos.map((photo) => (
              <div
                key={photo.url}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 11,
                  overflow: "hidden",
                  border: "1px solid var(--line-strong)",
                  boxShadow: "0 4px 12px var(--shadow)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: 22, borderBottom: "1px solid var(--line)" }}>
          <div style={sectionHeadStyle}>
            <span style={labelStyle}>The brief</span>
            <button onClick={onEditBrief} style={editBtnStyle}>
              Edit
            </button>
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 25,
              lineHeight: 1.3,
              color: "var(--ink)",
              borderLeft: "3px solid var(--tan)",
              paddingLeft: 16,
            }}
          >
            &quot;{brief}&quot;
          </p>
        </div>
        <div style={{ padding: 22 }}>
          <div style={sectionHeadStyle}>
            <span style={labelStyle}>Seller direction</span>
            <button onClick={onEditDirection} style={editBtnStyle}>
              Edit
            </button>
          </div>
          {hasDirection ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {hasMood && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={directionRowLabel}>Mood</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {moodWords.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "3px 10px",
                          background: "var(--surface2)",
                          color: "var(--ink)",
                          borderRadius: 999,
                          fontSize: "12.5px",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {hasRef && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={directionRowLabel}>Reference</span>
                  <span style={{ fontSize: "13.5px", color: "var(--ink)", wordBreak: "break-all" }}>{refLink}</span>
                </div>
              )}
              {hasNever && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={directionRowLabel}>Never</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {neverList.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "3px 10px",
                          background: "transparent",
                          border: "1px solid var(--tan)",
                          color: "var(--ink)",
                          borderRadius: 999,
                          fontSize: "12.5px",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {hasNotes && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={directionRowLabel}>Notes</span>
                  <span style={{ fontSize: "13.5px", color: "var(--ink)", lineHeight: 1.5 }}>{notes}</span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", fontStyle: "italic" }}>
              No additional direction provided.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
