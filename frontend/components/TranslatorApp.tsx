"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { STEP_MS, translateToAsl } from "@/lib/api";
import type { MobileTab, Stage, TranslationResult } from "@/lib/types";
import Disclaimer from "./Disclaimer";
import InputCard from "./InputCard";
import PreviewCard from "./PreviewCard";
import ReportModal from "./ReportModal";

export default function TranslatorApp() {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<MobileTab>("input");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKey, setReportKey] = useState(0);
  const [reportTime, setReportTime] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function translate() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    stopTimer();
    setStage("processing");
    setStep(0);
    setError("");
    setResult(null);
    setTab("preview");
    // Progress steps are cosmetic until the back end reports real progress.
    timerRef.current = setInterval(() => setStep((s) => Math.min(s + 1, 2)), STEP_MS);

    try {
      const output = await translateToAsl(text.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setResult(output);
      setStage("ready");
    } catch (err) {
      if (controller.signal.aborted) return; // cancelled on purpose
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    } finally {
      if (abortRef.current === controller) stopTimer();
    }
  }

  function cancel() {
    abortRef.current?.abort();
    stopTimer();
    setStage("idle");
    setTab("input");
  }

  function openReport(timeSec: number) {
    setReportTime(timeSec);
    setReportKey((k) => k + 1);
    setReportOpen(true);
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-7 md:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">A new way to see what you say.</h1>
          <p className="muted mt-2">Start with English. Explore an AI-generated ASL animation.</p>
        </div>
        <div
          className="hidden items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium md:flex"
          aria-label="Translation direction: English to ASL"
        >
          English <ArrowRight size={14} aria-hidden /> <span className="brand-text">ASL</span>
        </div>
      </div>

      <div role="tablist" aria-label="Workspace" className="seg mb-4 md:hidden">
        <button type="button" role="tab" aria-selected={tab === "input"} onClick={() => setTab("input")}>
          English input
        </button>
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
          ASL preview
        </button>
      </div>

      <div className="md:grid md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-5">
        <div className={tab === "input" ? "" : "hidden md:block"}>
          <InputCard text={text} onTextChange={setText} busy={stage === "processing"} onTranslate={translate} />
        </div>
        <div className={tab === "preview" ? "" : "hidden md:block"}>
          <PreviewCard
            stage={stage}
            step={step}
            result={result}
            error={error}
            reportOpen={reportOpen}
            onCancel={cancel}
            onRetry={translate}
            onEdit={() => setTab("input")}
            onReport={openReport}
          />
        </div>
      </div>

      <div className="mt-5">
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