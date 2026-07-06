"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import TagField from "./TagField";

interface DirectionStepProps {
  moodWords: string[];
  moodInput: string;
  onMoodInput: (value: string) => void;
  onMoodKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveMood: (i: number) => void;
  refLink: string;
  onRefInput: (e: ChangeEvent<HTMLInputElement>) => void;
  neverList: string[];
  neverInput: string;
  onNeverInput: (value: string) => void;
  onNeverKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveNever: (i: number) => void;
  notes: string;
  onNotesInput: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}

export default function DirectionStep({
  moodWords,
  moodInput,
  onMoodInput,
  onMoodKey,
  onRemoveMood,
  refLink,
  onRefInput,
  neverList,
  neverInput,
  onNeverInput,
  onNeverKey,
  onRemoveNever,
  notes,
  onNotesInput,
}: DirectionStepProps) {
  const fieldLabelStyle = {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.6px",
    textTransform: "uppercase" as const,
    color: "var(--ink-soft)",
    marginBottom: 8,
  };
  const hintStyle = { margin: "8px 0 0", fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.45 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--tan)",
          }}
        >
          Step three
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--muted)",
            border: "1px solid var(--line-strong)",
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          Optional
        </span>
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
        Any <em style={{ fontStyle: "italic", color: "var(--tan)" }}>direction</em> for us?
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: 16, lineHeight: 1.55, color: "var(--ink-soft)", maxWidth: "46ch" }}>
        Steer the tone or draw a few hard lines. Skip it and we&apos;ll go purely on your photos and brief.
      </p>

      <div style={{ border: "1px solid var(--line-strong)", borderRadius: 16, background: "var(--surface)", overflow: "hidden" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
          <label style={fieldLabelStyle}>Mood words</label>
          <TagField
            tags={moodWords}
            variant="solid"
            inputValue={moodInput}
            placeholder="type a word, press enter…"
            onInputChange={onMoodInput}
            onKeyDown={onMoodKey}
            onRemove={onRemoveMood}
          />
          <p style={hintStyle}>Three or four adjectives for the feeling. Shapes the pacing, music, and color grade.</p>
        </div>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
          <label style={fieldLabelStyle}>Reference ad</label>
          <input
            type="url"
            value={refLink}
            onChange={onRefInput}
            placeholder="https://…"
            className="pc-input-plain"
            style={{
              width: "100%",
              padding: "12px 15px",
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              color: "var(--ink)",
              background: "var(--bg)",
              border: "1px solid var(--line-strong)",
              borderRadius: 10,
            }}
          />
          <p style={hintStyle}>A video whose vibe you&apos;d love to echo — we study its rhythm, we don&apos;t copy it.</p>
        </div>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
          <label style={fieldLabelStyle}>Never do</label>
          <TagField
            tags={neverList}
            variant="outline"
            inputValue={neverInput}
            placeholder="type a rule, press enter…"
            onInputChange={onNeverInput}
            onKeyDown={onNeverKey}
            onRemove={onRemoveNever}
          />
          <p style={hintStyle}>Anything the ad should avoid — tone, imagery, or claims we shouldn&apos;t make.</p>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <label style={fieldLabelStyle}>Freeform notes</label>
          <textarea
            value={notes}
            onChange={onNotesInput}
            rows={3}
            placeholder="Your story, the buyer you picture, a line you always say…"
            className="pc-input-plain"
            style={{
              width: "100%",
              padding: "13px 15px",
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              color: "var(--ink)",
              background: "var(--bg)",
              border: "1px solid var(--line-strong)",
              borderRadius: 10,
              resize: "vertical",
              lineHeight: 1.55,
            }}
          />
          <p style={hintStyle}>The more context, the more the ad sounds like your shop.</p>
        </div>
      </div>
    </div>
  );
}
