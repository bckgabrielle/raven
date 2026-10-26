"use client";

import { useEffect, useRef, useState } from "react";
import { lookupSignReference, recognizeSignVideo } from "@/lib/api";
import type { MobileTab, Stage, TranslationResult } from "@/lib/types";
import Disclaimer from "./Disclaimer";
import InputCard from "./InputCard";
import PreviewCard from "./PreviewCard";
import ReportModal from "./ReportModal";

type Request =
  | { kind: "reference"; text: string }
  | { kind: "recognition"; file: File };

export default function TranslatorApp() {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [requestKind, setRequestKind] = useState<Request["kind"]>("reference");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<MobileTab>("input");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKey, setReportKey] = useState(0);
  const [reportTime, setReportTime] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<Request | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function execute(request: Request) {
    lastRequestRef.current = request;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStage("processing");
    setRequestKind(request.kind);
    setError("");
    setResult(null);
    setTab("preview");

    try {
      const output =
        request.kind === "reference"
          ? await lookupSignReference(request.text, controller.signal)
          : await recognizeSignVideo(request.file, controller.signal);
      if (controller.signal.aborted) return;
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

  function lookup() {
    void execute({ kind: "reference", text: text.trim() });
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
    setTab("input");
  }

  function openReport(timeSec: number) {
    setReportTime(timeSec);
    setReportKey((k) => k + 1);
    setReportOpen(true);
  }

  return (
    <main id="top" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-7 md:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Explore ASL signs with Raven.</h1>
          <p className="muted mt-2">
            Look up one gloss or ask the model to recognize an isolated sign video.
          </p>
        </div>
        <div
          className="hidden items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium md:flex"
          aria-label="ASL sign model"
        >
          <span className="brand-text">ASL sign model</span>
        </div>
      </div>

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
            onLookup={lookup}
            onRecognize={recognize}
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