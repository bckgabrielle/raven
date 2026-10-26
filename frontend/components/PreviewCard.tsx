"use client";

import { useRef } from "react";
import { CircleAlert, Flag, RotateCcw } from "lucide-react";
import ProcessingSteps from "./ProcessingSteps";
import type { Stage, TranslationResult } from "@/lib/types";

interface Props {
  stage: Stage;
  requestKind: "reference" | "recognition";
  result: TranslationResult | null;
  error: string;
  reportOpen: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onReport: (timeSec: number) => void;
}

export default function PreviewCard(p: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const chip =
    p.stage === "processing" ? (
      <span className="chip chip-brand">In progress</span>
    ) : p.stage === "ready" ? (
      p.result?.kind === "reference" && !p.result.supported ? (
        <span className="chip chip-warn">No exact match</span>
      ) : (
        <span className="chip chip-ok">Result ready</span>
      )
    ) : p.stage === "error" ? (
      <span className="chip chip-warn">Needs attention</span>
    ) : null;

  return (
    <section className="card" aria-labelledby="preview-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="preview-title" className="text-lg font-semibold">
          Model result
        </h2>
        {chip}
      </div>

      {p.stage === "idle" && (
        <div className="grid place-items-center rounded-xl bg-[#f3f7fe] px-6 py-16 text-center">
          <span className="text-4xl" aria-hidden>
            🤟
          </span>
          <p className="mt-3 font-medium">Your result will appear here</p>
          <p className="muted mt-1 max-w-xs text-sm">
            Look up one gloss or upload a video of one isolated sign.
          </p>
        </div>
      )}

      {p.stage === "processing" && (
        <>
          <ProcessingSteps recognition={p.requestKind === "recognition"} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="muted text-sm">Cancel to stop the current request.</p>
            <button type="button" className="btn btn-ghost" onClick={p.onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {p.stage === "error" && (
        <div role="alert" className="alert alert-danger flex items-start gap-3 p-4">
          <CircleAlert size={20} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">The model request failed.</p>
            <p className="mt-1">{p.error}</p>
            <button type="button" className="btn btn-ghost mt-3" onClick={p.onRetry}>
              <RotateCcw size={16} aria-hidden /> Try again
            </button>
          </div>
        </div>
      )}

      {p.stage === "ready" && p.result && (
        <>
          {p.result.kind === "reference" ? (
            p.result.supported && p.result.sequence[0] ? (
              <div>
                <p className="mb-2 font-semibold">
                  {p.result.sequence[0].gloss}
                  <span className="muted ml-2 text-sm font-normal">
                    ASL-LEX {p.result.sequence[0].aslLexCode}
                  </span>
                </p>
                <video
                  key={p.result.sequence[0].videoId}
                  ref={videoRef}
                  className="w-full rounded-xl bg-[var(--navy)]"
                  src={p.result.sequence[0].videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Recorded reference sign for ${p.result.sequence[0].gloss}`}
                >
                  Your browser does not support video playback.
                </video>
                <p className="muted mt-2 text-xs">
                  Recorded ASL-Citizen example · Participant ID is not shown.
                </p>
              </div>
            ) : (
              <div className="alert alert-warn">
                <p className="font-semibold">No exact gloss reference found.</p>
                <p className="mt-1">
                  Search one dataset gloss at a time. This lookup does not translate English sentences.
                </p>
              </div>
            )
          ) : (
            <div>
              <h3 className="font-semibold">Top isolated-sign predictions</h3>
              {p.result.predictions.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {p.result.predictions.map((prediction, index) => (
                    <li
                      key={`${prediction.gloss}-${index}`}
                      className="flex items-center justify-between rounded-lg bg-[#f3f7fe] px-3 py-2"
                    >
                      <span className="font-medium">
                        {index + 1}. {prediction.gloss}
                      </span>
                      <span className="muted text-sm">
                        {(prediction.confidence * 100).toFixed(1)}% model score
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="alert alert-warn mt-3">The model returned no sign predictions.</p>
              )}
              <p className="muted mt-2 text-xs">
                Scores are not calibrated probabilities. The model predicts one isolated sign, not a phrase.
              </p>
            </div>
          )}

          <p className="alert alert-brand mt-4">{p.result.warning}</p>

          <div className="mt-4 rounded-xl border border-[var(--line)] p-3 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                {p.result.kind === "recognition" ? "Uploaded video" : "Gloss lookup"}
              </span>
              <button type="button" className="btn-link text-xs" onClick={p.onEdit}>
                Try another
              </button>
            </div>
            <p className="muted mt-1 break-words text-sm">{p.result.text}</p>
          </div>

          <div className="divider mt-4 pt-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip chip-warn">Not human-reviewed</span>
              <span className="muted text-xs">{p.result.modelVersion}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="muted">Something look off?</span>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  videoRef.current?.pause();
                  p.onReport(videoRef.current?.currentTime ?? 0);
                }}
              >
                <Flag size={14} aria-hidden /> Report an issue
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
