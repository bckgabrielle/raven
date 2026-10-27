"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, FileUp, Sparkles, Type, Upload } from "lucide-react";
import { EXAMPLE_TEXT, MAX_CHARS, checkFile, checkFileText, checkText } from "@/lib/validation";

interface Props {
  text: string;
  onTextChange: (value: string) => void;
  busy: boolean;
  onTranslate: () => void;
}

type Mode = "text" | "transcript";

// One-tap starters. Delete this list (and the block that uses it) if you don't want them.
const QUICK_PHRASES = ["Hello, how are you?", "Thank you so much.", "Nice to meet you."];
const MAX_WORD_CHIPS = 12;

function CharRing({ length }: { length: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(length / MAX_CHARS, 1);
  const color = length > MAX_CHARS ? "var(--danger)" : ratio > 0.85 ? "var(--clay)" : "var(--olive)";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--sand)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        transform="rotate(-90 12 12)"
        style={{ transition: "stroke-dashoffset 0.2s, stroke 0.2s" }}
      />
    </svg>
  );
}

export default function InputCard({ text, onTextChange, busy, onTranslate }: Props) {
  const [mode, setMode] = useState<Mode>("text");
  const [fileIssue, setFileIssue] = useState<{ name: string; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const status = checkText(text);
  const canTranslate = mode === "text" && status.ok && !busy;
  const statusClass = status.tone === "ok" ? "ok-text" : status.tone === "error" ? "danger-text" : "muted";
  const words = text.trim() ? text.trim().split(/\s+/) : [];

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const typeProblem = checkFile(file);
    if (typeProblem) {
      setFileIssue({ name: file.name, message: typeProblem });
      return;
    }
    const content = (await file.text()).trim();
    const contentProblem = checkFileText(content);
    if (contentProblem) {
      setFileIssue({ name: file.name, message: contentProblem });
      return;
    }
    setFileIssue(null);
    onTextChange(content);
    setMode("text"); // lets the user review the extracted text before translating
  }

  return (
    <section className="card" aria-labelledby="input-title">
      <h2 id="input-title" className="card-title mb-4">
        <span className="step-num" aria-hidden>
          1
        </span>
        English input
      </h2>

      <div className="seg" role="tablist" aria-label="Input method">
        <button
          type="button"
          role="tab"
          id="tab-text"
          aria-controls="panel-text"
          aria-selected={mode === "text"}
          onClick={() => setMode("text")}
        >
          <Type size={16} aria-hidden /> Type text
        </button>
        <button
          type="button"
          role="tab"
          id="tab-transcript"
          aria-controls="panel-transcript"
          aria-selected={mode === "transcript"}
          onClick={() => setMode("transcript")}
        >
          <Upload size={16} aria-hidden /> Transcript
        </button>
      </div>

      {mode === "text" ? (
        <div role="tabpanel" id="panel-text" aria-labelledby="tab-text" className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="english-text" className="text-sm font-semibold">
              Your English text
            </label>
            <button type="button" className="btn-link text-xs" disabled={!text || busy} onClick={() => onTextChange("")}>
              Clear
            </button>
          </div>
          <textarea
            id="english-text"
            className="field min-h-36 w-full resize-y leading-relaxed"
            value={text}
            readOnly={busy}
            placeholder="Type or paste your English text here…"
            aria-describedby="text-status"
            aria-invalid={status.tone === "error"}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canTranslate) onTranslate();
            }}
          />
          <div className={`mt-1.5 flex items-center justify-end gap-2 text-xs ${text.length > MAX_CHARS ? "danger-text" : "muted"}`}>
            <CharRing length={text.length} />
            {text.length} / {MAX_CHARS} characters
          </div>
          <p id="text-status" aria-live="polite" className={`mt-1 flex items-center gap-2 text-sm ${statusClass}`}>
            {status.tone === "ok" && <Check size={16} aria-hidden />}
            {status.tone === "error" && <CircleAlert size={16} aria-hidden />}
            {status.message}
          </p>

          {/* Decorative: one chip pops in for each word as you type. The textarea stays the source of truth. */}
          {words.length > 0 && (
            <div className="words mt-3" aria-hidden>
              {words.slice(0, MAX_WORD_CHIPS).map((word, i) => (
                <span key={`${i}-${word}`} className="word">
                  {word}
                </span>
              ))}
              {words.length > MAX_WORD_CHIPS && <span className="word word-more">+{words.length - MAX_WORD_CHIPS} more</span>}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick phrases">
            {QUICK_PHRASES.map((phrase) => (
              <button key={phrase} type="button" className="phrase" disabled={busy} onClick={() => onTextChange(phrase)}>
                {phrase}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="panel-transcript" aria-labelledby="tab-transcript" className="mt-4">
          <div className="dropzone">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--sage-soft)]">
              <FileUp size={24} className="brand-text" aria-hidden />
            </span>
            <p className="mt-3 font-semibold">Upload a transcript</p>
            <p className="muted mt-1 text-xs leading-relaxed">
              Plain text (.txt), up to 1 MB
              <br />
              Maximum {MAX_CHARS} characters
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              aria-label="Choose a .txt transcript file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void loadFile(file);
              }}
            />
            <button type="button" className="btn btn-ghost mt-4 w-full" onClick={() => fileRef.current?.click()}>
              Choose a file
            </button>
          </div>
          {fileIssue && (
            <div role="alert" className="alert alert-warn mt-3">
              <p className="font-semibold">{fileIssue.name}</p>
              <p>{fileIssue.message}</p>
            </div>
          )}
        </div>
      )}

      <button type="button" className="btn btn-primary mt-5 w-full" disabled={!canTranslate} onClick={onTranslate}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden /> Creating animation…
          </>
        ) : (
          <>
            <ArrowRight size={16} aria-hidden /> Translate to ASL
          </>
        )}
      </button>
      <p className="muted mt-3 text-xs leading-relaxed">
        {mode === "text"
          ? "Use everyday language. Short, clear sentences work best in this prototype."
          : "You’ll review the extracted text before translating. No live audio or speech input."}
      </p>

      <div className="divider mt-4 flex flex-wrap items-center gap-2 pt-4 text-sm">
        <Sparkles size={16} className="text-[var(--clay-text)]" aria-hidden />
        <span className="muted">Need inspiration?</span>
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={() => {
            onTextChange(EXAMPLE_TEXT);
            setMode("text");
          }}
        >
          Try an example
        </button>
      </div>
    </section>
  );
}