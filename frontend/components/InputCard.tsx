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

export default function InputCard({ text, onTextChange, busy, onTranslate }: Props) {
  const [mode, setMode] = useState<Mode>("text");
  const [fileIssue, setFileIssue] = useState<{ name: string; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const status = checkText(text);
  const canTranslate = mode === "text" && status.ok && !busy;
  const statusClass = status.tone === "ok" ? "ok-text" : status.tone === "error" ? "danger-text" : "muted";

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
      <h2 id="input-title" className="mb-4 text-lg font-semibold">
        Start with English
      </h2>

      <div className="seg" role="tablist" aria-label="Input method">
        <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>
          <Type size={16} aria-hidden /> Type text
        </button>
        <button type="button" role="tab" aria-selected={mode === "transcript"} onClick={() => setMode("transcript")}>
          <Upload size={16} aria-hidden /> Transcript
        </button>
      </div>

      {mode === "text" ? (
        <div role="tabpanel" className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="english-text" className="text-sm font-medium">
              Your English text
            </label>
            <button type="button" className="btn-link text-xs" disabled={!text || busy} onClick={() => onTextChange("")}>
              Clear
            </button>
          </div>
          <textarea
            id="english-text"
            className="field min-h-36 w-full resize-y"
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
          <div className={`mt-1 text-right text-xs ${text.length > MAX_CHARS ? "danger-text" : "muted"}`}>
            {text.length} / {MAX_CHARS} characters
          </div>
          <p id="text-status" aria-live="polite" className={`mt-1 flex items-center gap-2 text-sm ${statusClass}`}>
            {status.tone === "ok" && <Check size={16} aria-hidden />}
            {status.tone === "error" && <CircleAlert size={16} aria-hidden />}
            {status.message}
          </p>
        </div>
      ) : (
        <div role="tabpanel" className="mt-4">
          <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center">
            <FileUp size={26} className="brand-text mx-auto" aria-hidden />
            <p className="mt-2 font-medium">Upload a transcript</p>
            <p className="muted mt-1 text-xs">
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
            <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => fileRef.current?.click()}>
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

      <button type="button" className="btn btn-primary mt-4 w-full" disabled={!canTranslate} onClick={onTranslate}>
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
      <p className="muted mt-3 text-xs">
        {mode === "text"
          ? "Use everyday language. Short, clear sentences work best in this prototype."
          : "You’ll review the extracted text before translating. No live audio or speech input."}
      </p>

      <div className="divider mt-4 flex items-center gap-2 pt-4 text-sm">
        <Sparkles size={16} className="brand-text" aria-hidden />
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