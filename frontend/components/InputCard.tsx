"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, FileUp, Sparkles, Type, Upload, Video } from "lucide-react";
import {
  EXAMPLE_TEXT,
  MAX_CHARS,
  checkFile,
  checkFileText,
  checkText,
  checkVideoFile,
} from "@/lib/validation";

interface Props {
  text: string;
  onTextChange: (value: string) => void;
  busy: boolean;
  onLookup: () => void;
  onRecognize: (file: File) => void;
}

type Mode = "text" | "transcript" | "sign-video";

export default function InputCard({ text, onTextChange, busy, onLookup, onRecognize }: Props) {
  const [mode, setMode] = useState<Mode>("text");
  const [fileIssue, setFileIssue] = useState<{ name: string; message: string } | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const status = checkText(text);
  const canTranslate =
    !busy &&
    ((mode === "text" && status.ok) || (mode === "sign-video" && videoFile !== null));
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

  function loadVideo(file: File | undefined) {
    if (!file) return;
    const problem = checkVideoFile(file);
    if (problem) {
      setVideoFile(null);
      setFileIssue({ name: file.name, message: problem });
      return;
    }
    setFileIssue(null);
    setVideoFile(file);
  }

  return (
    <section className="card" aria-labelledby="input-title">
      <h2 id="input-title" className="mb-2 text-lg font-semibold">
        Explore the sign model
      </h2>
      <p className="muted mb-4 text-sm">
        Look up one gloss or recognize an isolated sign from an MP4 clip.
      </p>

      <div className="seg grid-cols-3" role="tablist" aria-label="Input method">
        <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>
          <Type size={16} aria-hidden /> Gloss
        </button>
        <button type="button" role="tab" aria-selected={mode === "transcript"} onClick={() => setMode("transcript")}>
          <Upload size={16} aria-hidden /> Text file
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-video"}
          onClick={() => setMode("sign-video")}
        >
          <Video size={16} aria-hidden /> Sign video
        </button>
      </div>

      {mode === "text" && (
        <div role="tabpanel" className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="english-text" className="text-sm font-medium">
              One ASL gloss
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
            placeholder="For example: APPLE"
            aria-describedby="text-status"
            aria-invalid={status.tone === "error"}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canTranslate) onLookup();
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
      )}

      {mode === "transcript" && (
        <div role="tabpanel" className="mt-4">
          <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center">
            <FileUp size={26} className="brand-text mx-auto" aria-hidden />
            <p className="mt-2 font-medium">Upload a transcript</p>
            <p className="muted mt-1 text-xs">
              Gloss list (.txt), up to 1 MB
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

      {mode === "sign-video" && (
        <div role="tabpanel" className="mt-4">
          <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center">
            <Video size={26} className="brand-text mx-auto" aria-hidden />
            <p className="mt-2 font-medium">Recognize an isolated sign</p>
            <p className="muted mt-1 text-xs">MP4 video, up to 50 MB. Use footage you have permission to upload.</p>
            <input
              ref={videoRef}
              type="file"
              accept=".mp4,video/mp4"
              className="sr-only"
              aria-label="Choose an MP4 sign video"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                loadVideo(file);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost mt-3 w-full"
              disabled={busy}
              onClick={() => videoRef.current?.click()}
            >
              Choose an MP4
            </button>
            {videoFile && <p className="muted mt-2 break-all text-xs">{videoFile.name}</p>}
          </div>
          {fileIssue && (
            <div role="alert" className="alert alert-warn mt-3">
              <p className="font-semibold">{fileIssue.name}</p>
              <p>{fileIssue.message}</p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        disabled={!canTranslate}
        onClick={() => {
          if (mode === "sign-video" && videoFile) onRecognize(videoFile);
          else onLookup();
        }}
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden /> Checking the model…
          </>
        ) : mode === "sign-video" ? (
          <>
            <ArrowRight size={16} aria-hidden /> Recognize sign
          </>
        ) : (
          <>
            <ArrowRight size={16} aria-hidden /> Find sign reference
          </>
        )}
      </button>
      <p className="muted mt-3 text-xs">
        {mode === "text"
          ? "Searches an exact gloss match; sentences and English-to-ASL translation are not supported."
          : mode === "transcript"
            ? "Upload a text file containing one gloss, review it, then look it up."
            : "The video is sent to the configured model API for isolated-sign recognition."}
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
            setVideoFile(null);
            setFileIssue(null);
          }}
        >
          Try an example
        </button>
      </div>
    </section>
  );
}