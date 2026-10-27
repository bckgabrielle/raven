"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { STEP_MS, translateToAsl } from "@/lib/api";
import type { Stage, TranslationResult } from "@/lib/types";
import { recognizeSignVideo, transcribeAudio, translateText } from "@/lib/api";
import type { MobileTab, Stage, TranslationResult } from "@/lib/types";
import Disclaimer from "./Disclaimer";
import InputCard from "./InputCard";
import PreviewCard from "./PreviewCard";
import ProviderStatus from "./ProviderStatus";
import ReportModal from "./ReportModal";

type Request =
  | { kind: "translation"; text: string }
  | { kind: "transcription"; file: File }
  | { kind: "recognition"; file: File };

export default function TranslatorApp() {
  const [text, setText] = useState("");
  const [transcriptNotice, setTranscriptNotice] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [requestKind, setRequestKind] = useState<Request["kind"]>("translation");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKey, setReportKey] = useState(0);
  const [reportTime, setReportTime] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }
  const lastRequestRef = useRef<Request | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // On phones the preview opens below the input, so bring it into view when translating starts.
  useEffect(() => {
    if (stage !== "processing") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    previewRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [stage]);

  async function translate() {
  async function execute(request: Request) {
    lastRequestRef.current = request;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStage("processing");
    setRequestKind(request.kind);
    setError("");
    setResult(null);
    // Progress steps are cosmetic until the back end reports real progress.
    timerRef.current = setInterval(() => setStep((s) => Math.min(s + 1, 2)), STEP_MS);
    setTab("preview");

    try {
      if (request.kind === "transcription") {
        const transcript = await transcribeAudio(request.file, controller.signal);
        if (controller.signal.aborted) return;
        setText(transcript);
        setTranscriptNotice("Transcript ready. Review and edit it before drafting ASL glosses.");
        setStage("idle");
        setTab("input");
        return;
      }
      const output =
        request.kind === "translation"
          ? await translateText(request.text, controller.signal)
          : await recognizeSignVideo(request.file, controller.signal);
      if (controller.signal.aborted) return;
      setTranscriptNotice("");
      setResult(output);
      setStage("ready");
    } catch (err) {
      if (controller.signal.aborted) return; // cancelled on purpose
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function translate() {
    void execute({ kind: "translation", text: text.trim() });
  }

  function transcribe(file: File) {
    void execute({ kind: "transcription", file });
  }

  function recognize(file: File) {
    void execute({ kind: "recognition", file });
  }

  function retry() {
    if (lastRequestRef.current) void execute(lastRequestRef.current);
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage("idle");
  }

  function focusInput() {
    const field = document.getElementById("english-text");
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  }

  function openReport(timeSec: number) {
    setReportTime(timeSec);
    setReportKey((k) => k + 1);
    setReportOpen(true);
  }

  return (
    <main id="top" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-7 md:py-8">
      <div className="reveal mx-auto mb-8 max-w-2xl text-center">
        <p className="eyebrow mb-2">English → ASL studio</p>
        <h1 className="display text-4xl leading-tight md:text-5xl">A new way to see what you say.</h1>
        <p className="muted mt-3 text-lg">Start with English. Explore an AI-generated ASL animation.</p>
        <div className="pill mt-4 hidden md:inline-flex" aria-label="Translation direction: English to ASL">
          English <ArrowRight size={14} aria-hidden /> <span className="brand-text">ASL</span>
        </div>
      </div>

      {/* The preview only exists once the person has chosen Translate to ASL. */}
      <div className="workspace" data-split={stage !== "idle"}>
        <div className="reveal reveal-2 min-w-0">
          <InputCard text={text} onTextChange={setText} busy={stage === "processing"} onTranslate={translate} />
        </div>
        {stage !== "idle" && (
          <div ref={previewRef} className="preview-slot">
            <div className="slide-in">
              <PreviewCard
                stage={stage}
                step={step}
                result={result}
                error={error}
                reportOpen={reportOpen}
                onCancel={cancel}
                onRetry={translate}
                onEdit={focusInput}
                onReport={openReport}
              />
            </div>
          </div>
        )}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">From speech to ASL gloss drafts.</h1>
          <p className="muted mt-2">
            Transcribe, draft a gloss sequence, inspect references, and preview the Raven rig.
          </p>
        </div>
        <div
          className="hidden items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium md:flex"
          aria-label="ASL gloss draft pipeline"
        >
          <span className="brand-text">ASL draft · human review required</span>
        </div>
      </div>

      <ProviderStatus />

      <div role="tablist" aria-label="Workspace" className="seg mb-4 md:hidden">
        <button type="button" role="tab" aria-selected={tab === "input"} onClick={() => setTab("input")}>
          Input
        </button>
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
          Result
        </button>
      </div>

      <div className="md:grid md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-5">
        <div className={tab === "input" ? "" : "hidden md:block"}>
          <InputCard
            text={text}
            onTextChange={setText}
            busy={stage === "processing"}
            onTranslate={translate}
            onTranscribe={transcribe}
            onRecognize={recognize}
            transcriptNotice={transcriptNotice}
          />
        </div>
        <div className={tab === "preview" ? "" : "hidden md:block"}>
          <PreviewCard
            stage={stage}
            requestKind={requestKind}
            result={result}
            error={error}
            reportOpen={reportOpen}
            onCancel={cancel}
            onRetry={retry}
            onEdit={() => setTab("input")}
            onReport={openReport}
          />
        </div>
      </div>

      <div className="mt-6">
        <Disclaimer />
      </div>

      {result && (
        <ReportModal
          key={reportKey}
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          result={result}
          timeSec={reportTime}
        />
      )}
    </main>
  );
}