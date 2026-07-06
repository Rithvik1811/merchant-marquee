"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import type { Photo } from "./types";

interface PhotosStepProps {
  photos: Photo[];
  hoveredPhoto: number | null;
  dragOver: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onPickClick: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPhotoEnter: (i: number) => void;
  onPhotoLeave: () => void;
  onRemovePhoto: (i: number) => void;
}

export default function PhotosStep({
  photos,
  hoveredPhoto,
  dragOver,
  fileRef,
  onPickClick,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onPhotoEnter,
  onPhotoLeave,
  onRemovePhoto,
}: PhotosStepProps) {
  const photoCountLabel = photos.length ? `${photos.length} / 3 added` : "up to 3";

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
        Step one
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
        Show us the <em style={{ fontStyle: "italic", color: "var(--tan)" }}>real</em> thing.
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: 16, lineHeight: 1.55, color: "var(--ink-soft)", maxWidth: "46ch" }}>
        Upload two or three clear photos of your product. These are what we read — no stock, no rendering, just what
        you actually made.
      </p>

      <div
        onClick={onPickClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="pc-dropzone"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "24px 26px",
          borderRadius: 16,
          cursor: "pointer",
          boxShadow: "0 4px 16px var(--shadow)",
          border: `1.5px ${dragOver ? "solid var(--tan)" : "dashed var(--line-strong)"}`,
          background: dragOver ? "var(--surface2)" : "var(--surface)",
        }}
      >
        <div style={{ position: "relative", width: 58, height: 52, flex: "0 0 auto" }}>
          <div
            style={{
              position: "absolute",
              left: 9,
              top: 0,
              width: 42,
              height: 36,
              border: "1.5px solid var(--line-strong)",
              borderRadius: 6,
              background: "var(--surface)",
              transform: "rotate(-8deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 6,
              top: 11,
              width: 46,
              height: 40,
              border: "1.5px solid var(--tan)",
              borderRadius: 7,
              background: "var(--surface2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: 8,
                top: 6,
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "var(--tan)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: 0,
                height: 0,
                borderLeft: "15px solid transparent",
                borderRight: "15px solid transparent",
                borderBottom: "17px solid var(--tan)",
                opacity: 0.85,
                marginLeft: 5,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 17,
                bottom: 0,
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderBottom: "13px solid var(--tan)",
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.1px" }}>Drop your product photos here</div>
          <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 3 }}>
            or{" "}
            <span style={{ color: "var(--tan)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
              browse your files
            </span>{" "}
            — clear, well-lit shots read best
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: "0.5px",
            color: "var(--muted)",
            textAlign: "right",
            flex: "0 0 auto",
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span>{photoCountLabel}</span>
          <span>PNG · JPG</span>
        </div>
        <input
          type="file"
          ref={fileRef}
          accept="image/*"
          multiple
          onChange={onFileChange}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ display: photos.length ? "flex" : "none", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        {photos.map((photo, i) => (
          <div
            key={photo.url}
            onMouseEnter={() => onPhotoEnter(i)}
            onMouseLeave={onPhotoLeave}
            style={{
              position: "relative",
              width: 108,
              height: 108,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--line-strong)",
              flex: "0 0 auto",
              animation: "pc-rise 0.25s ease",
              boxShadow: "0 6px 16px var(--shadow)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div
              onClick={() => onRemovePhoto(i)}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                background: "linear-gradient(180deg, rgba(18,52,59,0.1), rgba(18,52,59,0.55))",
                opacity: hoveredPhoto === i ? 1 : 0,
                transition: "opacity .2s ease",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  color: "#f8efe1",
                  background: "rgba(18,52,59,0.6)",
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(248,239,225,0.3)",
                }}
              >
                Remove ×
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
