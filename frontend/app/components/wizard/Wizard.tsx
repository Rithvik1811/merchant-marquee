"use client";

import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import BriefStep from "./BriefStep";
import DirectionStep from "./DirectionStep";
import PhotosStep from "./PhotosStep";
import SummaryStep from "./SummaryStep";
import type { Photo } from "./types";

const STEP_MS = 340;

export interface WizardProps {
  step: 1 | 2 | 3 | 4;
  transitioning: boolean;

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

  brief: string;
  onBriefInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onBriefKey: (e: KeyboardEvent<HTMLInputElement>) => void;

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

  goNext: () => void;
  goBack: () => void;
  goStep: (n: 1 | 2 | 3 | 4) => void;
  onGenerate: () => void;
}

export default function Wizard(props: WizardProps) {
  const {
    step,
    transitioning,
    photos,
    brief,
    moodWords,
    refLink,
    neverList,
    notes,
    goNext,
    goBack,
    goStep,
    onGenerate,
  } = props;

  const nextDisabled = (step === 1 && photos.length < 1) || (step === 2 && !brief.trim());
  const showBack = step > 1;
  const showSkip = step === 3;
  const showNext = step <= 3;
  const showGenerate = step === 4;
  const nextLabel = step === 3 ? "Review →" : "Next →";
  let nextHint = "";
  if (step === 1 && photos.length < 1) nextHint = "Add at least one photo to continue";
  else if (step === 2 && !brief.trim()) nextHint = "Write a one-line brief to continue";

  const wizardWrapStyle = {
    minHeight: 300,
    animation: transitioning ? `pc-step-out ${STEP_MS}ms ease forwards` : `pc-step-in ${STEP_MS}ms ease`,
  };

  const ghostBtnStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    fontWeight: 600,
    padding: "12px 20px",
    border: "1px solid var(--line-strong)",
    background: "transparent",
    color: "var(--ink)",
    borderRadius: 10,
    cursor: "pointer",
  };
  const nextBtnStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: 15,
    fontWeight: 700,
    padding: "14px 30px",
    border: "none",
    borderRadius: 11,
    ...(nextDisabled
      ? { cursor: "not-allowed", opacity: 0.5, background: "var(--surface2)", color: "var(--muted)" }
      : { cursor: "pointer", background: "var(--accent)", color: "var(--accent-ink)", boxShadow: "0 6px 18px var(--shadow)" }),
  };
  const generateBtnStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: 16,
    fontWeight: 700,
    padding: "15px 32px",
    border: "none",
    borderRadius: 11,
    cursor: "pointer",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    boxShadow: "0 6px 20px var(--shadow)",
  };

  return (
    <div>
      <div
        style={{
          borderBottom: "1px solid var(--line)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          padding: "8px 46px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        For Etsy &amp; Shopify makers &nbsp;·&nbsp; Reads your real photos &nbsp;·&nbsp; Grounds every claim in a
        fact &nbsp;·&nbsp; Never invents what isn&apos;t there &nbsp;·&nbsp; Short-form ads, small-batch care
      </div>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 32px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  height: 4,
                  borderRadius: 999,
                  flex: 1,
                  background: step >= i ? "var(--tan)" : "var(--line-strong)",
                  transition: "background-color .3s ease",
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "var(--muted)",
              whiteSpace: "nowrap",
            }}
          >
            {step <= 3 ? `Step ${step} of 3` : "Review"}
          </span>
        </div>

        <div style={wizardWrapStyle}>
          {step === 1 && (
            <PhotosStep
              photos={props.photos}
              hoveredPhoto={props.hoveredPhoto}
              dragOver={props.dragOver}
              fileRef={props.fileRef}
              onPickClick={props.onPickClick}
              onDragOver={props.onDragOver}
              onDragLeave={props.onDragLeave}
              onDrop={props.onDrop}
              onFileChange={props.onFileChange}
              onPhotoEnter={props.onPhotoEnter}
              onPhotoLeave={props.onPhotoLeave}
              onRemovePhoto={props.onRemovePhoto}
            />
          )}
          {step === 2 && <BriefStep brief={brief} onBriefInput={props.onBriefInput} onBriefKey={props.onBriefKey} />}
          {step === 3 && (
            <DirectionStep
              moodWords={props.moodWords}
              moodInput={props.moodInput}
              onMoodInput={props.onMoodInput}
              onMoodKey={props.onMoodKey}
              onRemoveMood={props.onRemoveMood}
              refLink={props.refLink}
              onRefInput={props.onRefInput}
              neverList={props.neverList}
              neverInput={props.neverInput}
              onNeverInput={props.onNeverInput}
              onNeverKey={props.onNeverKey}
              onRemoveNever={props.onRemoveNever}
              notes={props.notes}
              onNotesInput={props.onNotesInput}
            />
          )}
          {step === 4 && (
            <SummaryStep
              photos={photos}
              brief={brief}
              moodWords={moodWords}
              refLink={refLink}
              neverList={neverList}
              notes={notes}
              onEditPhotos={() => goStep(1)}
              onEditBrief={() => goStep(2)}
              onEditDirection={() => goStep(3)}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 32 }}>
          {showBack && (
            <button onClick={goBack} className="pc-hoverable" style={ghostBtnStyle}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {showSkip && (
            <button
              onClick={goNext}
              className="pc-skip"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "12px 8px",
              }}
            >
              Skip for now
            </button>
          )}
          {showNext && (
            <button onClick={goNext} disabled={nextDisabled} style={nextBtnStyle}>
              {nextLabel}
            </button>
          )}
          {showGenerate && (
            <button onClick={onGenerate} style={generateBtnStyle}>
              Generate my ad →
            </button>
          )}
        </div>
        {nextHint && (
          <div
            style={{
              textAlign: "right",
              marginTop: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {nextHint}
          </div>
        )}
      </main>
    </div>
  );
}
