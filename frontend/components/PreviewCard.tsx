"use client";

import { CircleAlert, Flag, Pause, Play, RotateCcw } from "lucide-react";
import ProcessingSteps from "./ProcessingSteps";
import { SPEEDS, formatTime, useAvatarPlayback } from "@/lib/useAvatarPlayback";
import type { Stage, TranslationResult } from "@/lib/types";

interface Props {
  stage: Stage;
  step: number;
  result: TranslationResult | null;
  error: string;
  reportOpen: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onReport: (timeSec: number) => void;
}

function AvatarStage({ playing, time, name }: { playing: boolean; time: number; name?: string }) {
  const letters = name ? name.toUpperCase().split("") : [];
  const active = playing ? Math.floor(time * 2) % Math.max(letters.length, 1) : -1;
  return (
    <div
      role="img"
      aria-label="Sign language avatar placeholder"
      className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-[var(--navy)]"
    >
      <span className="chip absolute left-3 top-3 bg-[var(--accent)] text-[var(--navy)]">
        AI avatar · Demo animation
      </span>
      <div className="text-center text-white">
        <span className={`inline-block text-6xl ${playing ? "wave" : ""}`} aria-hidden>
          🤟
        </span>
        <p className="mt-2 text-sm font-medium">{playing ? "Signing…" : "Avatar placeholder"}</p>
        <p className="text-xs text-white/80">The model’s motion output will render here.</p>
      </div>
      {letters.length > 0 && (
        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
          <span className="mr-1 text-xs text-white/80">Fingerspelling</span>
          {letters.map((letter, i) => (
            <span
              key={i}
              className={`grid h-7 w-7 place-items-center rounded-md text-sm font-bold ${
                i === active ? "bg-[var(--accent)] text-[var(--navy)]" : "bg-white/15 text-white"
              }`}
            >
              {letter}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PreviewCard(p: Props) {
  const duration = p.result?.durationSec ?? 0;
  const pb = useAvatarPlayback(duration, p.result, p.stage === "ready" && !p.reportOpen);

  const chip =
    p.stage === "processing" ? (
      <span className="chip chip-brand">In progress</span>
    ) : p.stage === "ready" ? (
      <span className="chip chip-ok">{pb.playing ? "Playing" : "Ready"}</span>
    ) : p.stage === "error" ? (
      <span className="chip chip-warn">Needs attention</span>
    ) : null;

  const names = p.result?.fingerspelled ?? [];
  const unsupported = p.result?.unsupported ?? [];

  return (
    <section className="card" aria-labelledby="preview-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="preview-title" className="text-lg font-semibold">
          Your ASL preview
        </h2>
        {chip}
      </div>

      {p.stage === "idle" && (
        <div className="grid place-items-center rounded-xl bg-[#f3f7fe] px-6 py-16 text-center">
          <span className="text-4xl" aria-hidden>
            🤟
          </span>
          <p className="mt-3 font-medium">Your ASL preview will appear here</p>
          <p className="muted mt-1 max-w-xs text-sm">
            Add English on the left, then choose Translate to ASL.
          </p>
        </div>
      )}

      {p.stage === "processing" && (
        <>
          <ProcessingSteps step={p.step} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="muted text-sm">Your English text is kept if you cancel.</p>
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
            <p className="font-semibold">We couldn’t create this animation.</p>
            <p className="mt-1">{p.error} Your English text is still saved, so you can try again.</p>
            <button type="button" className="btn btn-ghost mt-3" onClick={p.onRetry}>
              <RotateCcw size={16} aria-hidden /> Try again
            </button>
          </div>
        </div>
      )}

      {p.stage === "ready" && p.result && (
        <>
          <AvatarStage playing={pb.playing} time={pb.time} name={names[0]} />

          <div className="mt-4">
            <input
              type="range"
              className="range"
              min={0}
              max={duration}
              step={0.1}
              value={pb.time}
              aria-label="Playback position"
              aria-valuetext={`${formatTime(pb.time)} of ${formatTime(duration)}`}
              onChange={(e) => pb.seek(Number(e.target.value))}
            />
            <div className="muted flex justify-between text-xs">
              <span>{formatTime(pb.time)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={pb.toggle}>
              {pb.playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              {pb.playing ? "Pause" : "Play"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={pb.replay}>
              <RotateCcw size={16} aria-hidden /> Replay
            </button>
            <label className="muted ml-auto flex items-center gap-2 text-sm">
              Speed
              <select
                className="field py-2"
                value={pb.speed}
                onChange={(e) => pb.setSpeed(Number(e.target.value))}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted mt-2 text-xs">Press Space to play or pause.</p>

          <div className="mt-4 rounded-xl border border-[var(--line)] p-3 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Your English</span>
              <button type="button" className="btn-link text-xs" onClick={p.onEdit}>
                Edit text
              </button>
            </div>
            <p className="muted mt-1 text-sm">{p.result.text}</p>
          </div>

          <div className="divider mt-4 pt-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip chip-warn">Not human-reviewed</span>
              <span className="muted text-xs">{p.result.modelVersion} · Saved result</span>
            </div>
            {names.length > 0 && (
              <p className="muted mt-2">
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
              <button type="button" className="btn-link" onClick={() => p.onReport(pb.time)}>
                <Flag size={14} aria-hidden /> Report an issue
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}