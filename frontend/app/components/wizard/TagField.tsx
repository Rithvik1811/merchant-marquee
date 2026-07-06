"use client";

import type { KeyboardEvent } from "react";

interface TagFieldProps {
  tags: string[];
  variant: "solid" | "outline";
  inputValue: string;
  placeholder: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}

export default function TagField({
  tags,
  variant,
  inputValue,
  placeholder,
  onInputChange,
  onKeyDown,
  onRemove,
}: TagFieldProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: 9,
        border: "1px solid var(--line-strong)",
        borderRadius: 10,
        background: "var(--bg)",
      }}
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 7px 5px 12px",
            background: variant === "solid" ? "var(--surface2)" : "transparent",
            border: variant === "outline" ? "1px solid var(--tan)" : undefined,
            color: "var(--ink)",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {tag}
          <button
            onClick={() => onRemove(i)}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: 15,
              lineHeight: 1,
              opacity: 0.6,
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 150,
          border: "none",
          background: "transparent",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          color: "var(--ink)",
          padding: "4px 6px",
        }}
      />
    </div>
  );
}
