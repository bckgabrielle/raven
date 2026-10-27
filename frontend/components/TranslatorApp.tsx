"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { STEP_MS, translateToAsl } from "@/lib/api";
import type { MobileTab, Stage, TranslationResult } from "@/lib/types";
import Disclaimer from "./Disclaimer";
import InputCard from "./InputCard";
import PreviewCard from "./PreviewCard";
import ReportModal from "./ReportModal";

/** Decorative welcome illustration. Hidden from assistive tech. */
function HeroArt() {
  return (
    <div className="hero-art hidden md:block" aria-hidden>
      <svg viewBox="-100 -100 200 200">
        <path
          d="M60,-70C82,-50,92,-18,84,12C76,42,52,66,22,76C-8,86,-42,80,-64,58C-86,36,-92,-4,-78,-36C-64,-68,-30,-92,4,-92C28,-93,44,-86,60,-70Z"
          fill="var(--sage-soft)"
          stroke="var(--olive)"
          strokeWidth="1.5"
          strokeDasharray="5 6"
        />
      </svg>
      <span className="hero-hand">🤟</span>
      <div className="bubble">
        <span className="bubble-words">
          <span>Hello</span>
          <span>Welcome</span>
          <span>Thank you</span>
          <span>Friend</span>
        </span>
      </div>
    </div>
  );
}

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
      <div className="reveal mb-7 flex items-center justify-between gap-6">
        <div>
          <p className="eyebrow mb-2">English → ASL studio</p>
          <h1 className="display text-4xl leading-tight md:text-5xl">A new way to see what you say.</h1>
          <p className="muted mt-3 max-w-xl text-lg">Start with English. Explore an AI-generated ASL animation.</p>
          <div className="pill mt-4 hidden md:inline-flex" aria-label="Translation direction: English to ASL">
            English <ArrowRight size={14} aria-hidden /> <span className="brand-text">ASL</span>
          </div>
        </div>
        <HeroArt />
      </div>

      <div role="tablist" aria-label="Workspace" className="seg mb-4 md:hidden">
        <button type="button" role="tab" aria-selected={tab === "input"} onClick={() => setTab("input")}>
          English input
        </button>
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
          ASL preview
        </button>
      </div>

      <div className="md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-6">
        <div className={`reveal reveal-2 ${tab === "input" ? "" : "hidden md:block"}`}>
          <InputCard text={text} onTextChange={setText} busy={stage === "processing"} onTranslate={translate} />
        </div>
        <div className={`reveal reveal-3 ${tab === "preview" ? "" : "hidden md:block"}`}>
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