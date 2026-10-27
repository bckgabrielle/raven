"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileAudio,
  FileUp,
  Mic,
  Square,
  Sparkles,
  Type,
  Upload,
  Video,
} from "lucide-react";
import {
  EXAMPLE_TEXT,
  MAX_CHARS,
  checkFile,
  checkFileText,
  checkAudioFile,
  checkText,
  checkVideoFile,
} from "@/lib/validation";

interface Props {
  text: string;
  onTextChange: (value: string) => void;
  busy: boolean;
  transcriptNotice: string;
  onTranslate: () => void;
  onTranscribe: (file: File) => void;
  onRecognize: (file: File) => void;
}

type Mode = "text" | "transcript" | "audio" | "sign-video";

export default function InputCard({
  text,
  onTextChange,
  busy,
  transcriptNotice,
  onTranslate,
  onTranscribe,
  onRecognize,
}: Props) {
  const [mode, setMode] = useState<Mode>("text");
  const [fileIssue, setFileIssue] = useState<{ name: string; message: string } | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const status = checkText(text);
  const canTranslate =
    !busy &&
    ((mode === "text" && status.ok && cloudConsent) ||
      (mode === "audio" && audioFile !== null && cloudConsent) ||
      (mode === "sign-video" && videoFile !== null));
  const statusClass = status.tone === "ok" ? "ok-text" : status.tone === "error" ? "danger-text" : "muted";

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const typeProblem = checkFile(file);
    if (typeProblem) {
      setFileIssue({ name: file.name, message: typeProblem });
      return;
    }
    try {
      const content = (await file.text()).trim();
      const contentProblem = checkFileText(content);
      if (contentProblem) {
        setFileIssue({ name: file.name, message: contentProblem });
        return;
      }
      setFileIssue(null);
      onTextChange(content);
      setMode("text");
    } catch {
      setFileIssue({ name: file.name, message: "This file could not be read. Try another .txt file." });
    }
  }

  function loadAudio(file: File | undefined) {
    if (!file) return;
    const problem = checkAudioFile(file);
    if (problem) {
      setAudioFile(null);
      setFileIssue({ name: file.name, message: problem });
      return;
    }
    setFileIssue(null);
    setAudioFile(file);
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

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFileIssue({
        name: "Microphone unavailable",
        message: "This browser does not support microphone recording. Upload an audio file instead.",
      });
      return;
    }
    let stream: MediaStream | null = null;
    try {
      const recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = recordingStream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        recordingStream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
        loadAudio(new File([blob], `raven-recording.${extension}`, { type: blob.type }));
        setRecording(false);
      };
      recorder.onerror = () => {
        recordingStream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setFileIssue({
          name: "Recording failed",
          message: "The microphone recording could not be completed. Try uploading an audio file.",
        });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setFileIssue(null);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setFileIssue({
        name: "Microphone permission denied",
        message: "Allow microphone access or upload an audio file instead.",
      });
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function changeMode(nextMode: Mode) {
    if (recording) stopRecording();
    setMode(nextMode);
    setFileIssue(null);
  }

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    [],
  );
  return (
    <section className="card" aria-labelledby="input-title">
      <h2 id="input-title" className="mb-2 text-lg font-semibold">
        Start with words or speech
      </h2>
      <p className="muted mb-4 text-sm">
        Transcribe spoken English, then draft ASL glosses and find reference signs.
      </p>

      <div className="seg grid-cols-4" role="tablist" aria-label="Input method">
        <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => changeMode("text")}>
          <Type size={16} aria-hidden /> Text
        </button>
        <button type="button" role="tab" aria-selected={mode === "transcript"} onClick={() => changeMode("transcript")}>
          <Upload size={16} aria-hidden /> .txt
        </button>
        <button type="button" role="tab" aria-selected={mode === "audio"} onClick={() => changeMode("audio")}>
          <Mic size={16} aria-hidden /> Audio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-video"}
          onClick={() => changeMode("sign-video")}
        >
          <Video size={16} aria-hidden /> Sign video
        </button>
      </div>

      {mode === "text" && (
        <div role="tabpanel" className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="english-text" className="text-sm font-medium">
              English text
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
            placeholder="Type or paste a short English sentence…"
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
          {transcriptNotice && <p role="status" className="alert alert-brand mt-3">{transcriptNotice}</p>}
        </div>
      )}

      {mode === "transcript" && (
        <div role="tabpanel" className="mt-4">
          <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center">
            <FileUp size={26} className="brand-text mx-auto" aria-hidden />
            <p className="mt-2 font-medium">Upload a transcript</p>
            <p className="muted mt-1 text-xs">
              English text (.txt), up to 1 MB
              <br />Maximum {MAX_CHARS} characters
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

      {mode === "audio" && (
        <div role="tabpanel" className="mt-4">
          <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center">
            <FileAudio size={26} className="brand-text mx-auto" aria-hidden />
            <p className="mt-2 font-medium">Transcribe spoken English</p>
            <p className="muted mt-1 text-xs">
              WAV, MP3, M4A, OGG, FLAC, MP4, or WebM audio · maximum 25 MB
            </p>
            <input
              ref={audioRef}
              type="file"
              accept=".wav,.mp3,.m4a,.ogg,.flac,.mp4,.webm,.mpeg,.mpga,.opus,audio/*"
              className="sr-only"
              aria-label="Choose audio to transcribe"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                loadAudio(file);
              }}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={busy || recording}
                onClick={() => audioRef.current?.click()}
              >
                Choose audio
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={busy}
                onClick={() => (recording ? stopRecording() : void startRecording())}
              >
                {recording ? <Square size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
                {recording ? "Stop recording" : "Record voice"}
              </button>
            </div>
            {audioFile && <p className="muted mt-2 break-all text-xs">{audioFile.name}</p>}
            {recording && <p role="status" className="danger-text mt-2 text-sm">Recording…</p>}
          </div>
          {fileIssue && (
            <div role="alert" className="alert alert-warn mt-3">
              <p className="font-semibold">{fileIssue.name}</p>
              <p>{fileIssue.message}</p>
            </div>
          )}
          {audioFile && !recording && (
            <button
              type="button"
              className="btn btn-ghost mt-3 w-full"
              disabled={busy || !cloudConsent}
              onClick={() => {
                setMode("text");
                onTranscribe(audioFile);
              }}
            >
              Transcribe audio to text
            </button>
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

      {mode !== "audio" && <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        disabled={!canTranslate}
        onClick={() => {
          if (mode === "sign-video" && videoFile) onRecognize(videoFile);
          else onTranslate();
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
            <ArrowRight size={16} aria-hidden /> Draft ASL glosses
          </>
        )}
      </button>}
      {(mode === "text" || mode === "transcript" || mode === "audio") && (
        <label className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--bg)] p-3 text-xs">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--brand)]"
            checked={cloudConsent}
            disabled={busy}
            onChange={(event) => setCloudConsent(event.target.checked)}
          />
          <span>
            I understand that text or audio may be sent to Groq for processing. Audio is sent to its
            speech-to-text service. I will not submit sensitive information without permission.
          </span>
        </label>
      )}
      <p className="muted mt-3 text-xs">
        {mode === "text"
          ? "The Groq-generated gloss is a draft and is not verified by a Deaf ASL reviewer."
          : mode === "transcript"
            ? "Review your transcript before sending it for an unreviewed gloss draft."
            : mode === "audio"
              ? "Review the transcript for errors before requesting an ASL gloss draft."
              : "The video is sent to the local model API for isolated-sign recognition."}
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
            setAudioFile(null);
            setFileIssue(null);
          }}
        >
          Try an example
        </button>
      </div>
    </section>
  );
}