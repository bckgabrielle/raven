"use client";

import { useRef } from "react";
import { CircleAlert, Flag, RotateCcw } from "lucide-react";
import AvatarViewer from "./AvatarViewer";
import ProcessingSteps from "./ProcessingSteps";
import type { Stage, TranslationResult } from "@/lib/types";

interface Props {
  stage: Stage;
  requestKind: "translation" | "transcription" | "recognition";
  result: TranslationResult | null;
  error: string;
  reportOpen: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onReport: (timeSec: number) => void;
}

function AvatarStage({
  playing,
  time,
  name,
  onToggle,
}: {
  playing: boolean;
  time: number;
  name?: string;
  onToggle: () => void;
}) {
  const letters = name ? name.toUpperCase().split("") : [];
  const active = playing ? Math.floor(time * 2) % Math.max(letters.length, 1) : -1;
  return (
    <div className="stage-wrap">
      <div role="img" aria-label="Sign language avatar placeholder" className="stage" data-playing={playing}>
        <span className="chip stage-chip absolute left-3 top-3">AI avatar · Demo animation</span>
        <div className="text-center">
          <span className={`inline-block text-6xl ${playing ? "wave" : ""}`} aria-hidden>
            🤟
          </span>
          <p className="mt-2 text-sm font-semibold">{playing ? "Signing…" : "Avatar placeholder"}</p>
          <p className="text-xs opacity-80">The model’s motion output will render here.</p>
        </div>
        {letters.length > 0 && (
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
            <span className="mr-1 text-xs opacity-80">Fingerspelling</span>
            {letters.map((letter, i) => (
              <span key={i} className="spell" data-active={i === active}>
                {letter}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Mouse shortcut: click the stage to play or pause. It is kept out of the tab order
          (the Play button below is the keyboard control) and never takes focus, so the
          Space shortcut can't fire twice. */}
      <button
        type="button"
        className="stage-toggle"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
      >
        <span className="stage-toggle__icon">
          {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
        </span>
      </button>
    </div>
  );
}

export default function PreviewCard(p: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const chip =
    p.stage === "processing" ? (
      <span className="chip chip-brand">In progress</span>
    ) : p.stage === "ready" ? (
      <span className="chip chip-warn">Unreviewed result</span>
    ) : p.stage === "error" ? (
      <span className="chip chip-warn">Needs attention</span>
    ) : null;

  return (
    <section className="card" aria-labelledby="preview-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="preview-title" className="card-title">
          <span className="step-num" aria-hidden>
            2
          </span>
          Your ASL preview
        <h2 id="preview-title" className="text-lg font-semibold">
          ASL draft and avatar
        </h2>
        {chip}
      </div>

      {p.stage === "idle" && (
        <div className="panel-soft grid place-items-center px-6 py-16 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-full bg-[var(--surface)] text-4xl shadow-[3px_3px_0_var(--sand-deep)]"
            aria-hidden
          >
            <span className="wave">🤟</span>
          </span>
          <p className="display mt-4 text-lg">Your ASL preview will appear here</p>
          <p className="muted mt-1 max-w-xs text-sm leading-relaxed">
            Add English on the left, then choose Translate to ASL.
        <div className="grid place-items-center rounded-xl bg-[#f3f7fe] px-6 py-16 text-center">
          <span className="text-4xl" aria-hidden>🤟</span>
          <p className="mt-3 font-medium">Your gloss draft will appear here</p>
          <p className="muted mt-1 max-w-xs text-sm">
            Enter or transcribe English, then review the suggested ASL gloss sequence.
          </p>
        </div>
      )}

      {p.stage === "processing" && (
        <>
          <ProcessingSteps step={p.step} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="muted text-sm">Your English text is kept if you cancel.</p>
          <ProcessingSteps requestKind={p.requestKind} />
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
            <p className="font-semibold">The request failed.</p>
            <p className="mt-1">{p.error}</p>
            <button type="button" className="btn btn-ghost mt-3" onClick={p.onRetry}>
              <RotateCcw size={16} aria-hidden /> Try again
            </button>
          </div>
        </div>
      )}

      {p.stage === "ready" && p.result && (
        <>
          <AvatarStage playing={pb.playing} time={pb.time} name={names[0]} onToggle={pb.toggle} />
          {p.result.kind === "translation" ? (
            <>
              <div className="rounded-xl bg-[#f3f7fe] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  English input
                </p>
                <p className="mt-1 whitespace-pre-wrap">{p.result.text}</p>
              </div>

              <section className="mt-4" aria-labelledby="gloss-title">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="gloss-title" className="font-semibold">Suggested ASL gloss order</h3>
                  <span className="chip chip-warn">
                    {p.result.translationSource === "groq_unreviewed" ? "Groq draft" : "Local fallback"}
                  </span>
                </div>
                {p.result.glosses.length > 0 ? (
                  <ol className="mt-3 flex flex-wrap gap-2">
                    {p.result.glosses.map((gloss, index) => {
                      const entry =
                        p.result?.kind === "translation" ? p.result.sequence[index] : undefined;
                      return (
                        <li
                          key={`${gloss}-${index}`}
                          className={`chip ${entry?.supported ? "chip-brand" : "chip-warn"}`}
                          title={entry?.supported ? "Reference video available" : "No exact dataset gloss reference"}
                        >
                          {index + 1}. {gloss}
                          {!entry?.supported && <span aria-label="unsupported"> · no clip</span>}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="alert alert-warn mt-3">
                    No glosses were returned. Try shorter text or check the Groq configuration.
                  </p>
                )}
              </section>

              <div className="mt-4">
                <AvatarViewer
                  sequence={p.result.sequence.map((entry) => ({
                    gloss: entry.gloss,
                    poseUrl: entry.poseUrl,
                  }))}
                />
                {p.result.sequence.some((entry) => entry.poseUrl !== null) ? (
                  <>
                    <p className="alert alert-warn mt-2">
                      Available extracted clips can be played in gloss order. Transitions,
                      handshape retargeting, and the draft translation are experimental and not
                      ASL-reviewed.
                    </p>
                    {p.result.sequence.some((entry) => entry.poseUrl === null) && (
                      <p className="alert alert-warn mt-2">
                        These glosses will not play because no pose track is extracted:{" "}
                        {p.result.sequence
                          .filter((entry) => entry.poseUrl === null)
                          .map((entry) => entry.gloss)
                          .join(", ")}.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="alert alert-warn mt-2">
                    No pose tracks have been extracted for these glosses yet. Run the local
                    extraction command in MODEL_BACKBONE.md before avatar playback is available.
                    HELLO and THANK-YOU remain hand-keyed rig demos.
                  </p>
                )}
              </div>

              <section className="mt-4" aria-labelledby="references-title">
                <h3 id="references-title" className="font-semibold">Available recorded sign references</h3>
                <p className="muted mt-1 text-xs">
                  Each clip is an isolated training example; playing a sequence does not create
                  grammatical or expert-reviewed ASL.
                </p>
                <ol className="mt-3 space-y-3">
                  {p.result.sequence.map((entry, index) => (
                    <li key={`${entry.gloss}-${index}`} className="rounded-xl border border-[var(--line)] p-3">
                      <p className="mb-2 font-semibold">
                        {index + 1}. {entry.gloss}
                        {entry.reference && (
                          <span className="muted ml-2 text-xs font-normal">
                            ASL-LEX {entry.reference.aslLexCode}
                          </span>
                        )}
                      </p>
                      {entry.reference ? (
                        <video
                          ref={videoRef}
                          className="max-h-72 w-full rounded-lg bg-[var(--navy)]"
                          src={entry.reference.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={`Recorded reference sign for ${entry.gloss}`}
                        >
                          Your browser does not support video playback.
                        </video>
                      ) : (
                        <p className="alert alert-warn text-xs">
                          No exact reference in the local dataset; this sign cannot be previewed.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>

              {p.result.unsupportedGlosses.length > 0 && (
                <p className="alert alert-warn mt-4">
                  Dataset references were not found for: {p.result.unsupportedGlosses.join(", ")}.
                </p>
              )}
              {p.result.warnings.map((warning) => (
                <p key={warning} className="alert alert-brand mt-3">{warning}</p>
              ))}
            </>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Top isolated-sign predictions</h3>
                <span className="muted text-xs">{p.result.modelVersion}</span>
              </div>
              {p.result.predictions.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {p.result.predictions.map((prediction, index) => (
                    <li
                      key={`${prediction.gloss}-${index}`}
                      className="flex items-center justify-between rounded-lg bg-[#f3f7fe] px-3 py-2"
                    >
                      <span className="font-medium">{index + 1}. {prediction.gloss}</span>
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
              <p className="alert alert-brand mt-4">{p.result.warning}</p>
            </div>
          )}

          <div className="panel-soft mt-4 p-3 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Submitted input</span>
              <button type="button" className="btn-link text-xs" onClick={p.onEdit}>
                Try another
              </button>
            </div>
            <p className="muted mt-1 break-words text-sm">{p.result.text}</p>
          </div>

          <div className="divider mt-4 pt-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip chip-warn">Not human-reviewed</span>
              {p.result.kind === "translation" && (
                <span className="muted text-xs">{p.result.modelVersion}</span>
              )}
            </div>
            {names.length > 0 && (
              <p className="muted mt-2 leading-relaxed">
                {names.map((n) => `“${n}”`).join(", ")} {names.length === 1 ? "is" : "are"} marked for
                fingerspelling. Names, timing, and facial expression may need review.
              </p>
            )}
            {unsupported.length > 0 && (
              <p className="alert alert-warn mt-2">
                These phrases may not be supported yet: {unsupported.join(", ")}.
              </p>
            )}
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
