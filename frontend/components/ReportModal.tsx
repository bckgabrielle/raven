"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { sendFeedback } from "@/lib/api";
import { formatTime } from "@/lib/useAvatarPlayback";
import type { IssueCategory, TranslationResult } from "@/lib/types";

const CATEGORIES: { value: IssueCategory; label: string }[] = [
  { value: "fingerspelling", label: "Fingerspelling or name" },
  { value: "sign", label: "Sign or phrase" },
  { value: "timing", label: "Timing or expression" },
  { value: "unsupported", label: "Unsupported phrase" },
  { value: "playback", label: "Playback" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  result: TranslationResult;
  timeSec: number;
}

// The parent gives this component a new `key` each time it opens,
// so the form always starts fresh. Only DOM work happens in the effect.
export default function ReportModal({ open, onClose, result, timeSec }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<IssueCategory>("fingerspelling");
  const [details, setDetails] = useState("");
  const [includeText, setIncludeText] = useState(true);
  const [status, setStatus] = useState<"form" | "sending" | "sent">("form");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (details.trim().length < 3) {
      setError("Tell us a little about what you noticed.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      await sendFeedback({
        category,
        details: details.trim(),
        playbackTimeSec: Math.round(timeSec * 10) / 10,
        modelVersion: result.modelVersion,
        englishText: includeText ? result.text : undefined,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("form");
      setError(err instanceof Error ? err.message : "We couldn’t send your feedback.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="report-title"
      className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/50 md:m-auto md:h-auto md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl"
    >
      <div className="p-5 md:p-6">
        {/* One way out per screen size: Back link on phones, X on larger screens. */}
        <button type="button" className="btn-link mb-4 md:hidden" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden /> Back to preview
        </button>

        <div className="flex items-start justify-between gap-3">
          <h2 id="report-title" className="text-2xl font-semibold">
            {status === "sent" ? "Thanks for taking a closer look." : "Help us improve Raven"}
          </h2>
          <button type="button" aria-label="Close" className="btn-icon hidden md:inline-flex" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>

        {status === "sent" ? (
          <div className="mt-4">
            <p className="muted">
              This feedback preview is simulated. Your note has not been saved or shared.
            </p>
            <div className="mt-4 rounded-xl bg-[var(--bg)] p-4 text-sm">
              <p className="font-semibold">{categoryLabel}</p>
              <p className="muted mt-1">“{details.trim()}”</p>
              {includeText && <p className="muted mt-2 text-xs">Input and model version included</p>}
            </div>
            <p className="muted mt-4 text-center text-sm">
              Feedback does not change the current model result.
            </p>
            <button type="button" className="btn btn-primary mt-4 w-full" onClick={onClose}>
              <ArrowRight size={16} aria-hidden /> Return to result
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3" noValidate>
            <p className="muted text-sm">
              Notice a questionable sign prediction or reference? Tell us what needs another look.
            </p>

            <div className="mt-4 rounded-xl bg-[var(--bg)] p-3 text-sm">
              <p className="muted text-xs font-semibold">
                This result · {formatTime(timeSec)}
              </p>
              <p className="mt-1 break-words">“{result.text}”</p>
              <p className="muted mt-1 text-xs">{result.modelVersion} · Playback time attached</p>
            </div>

            <label htmlFor="issue-category" className="mt-4 block text-sm font-semibold">
              What needs attention?
            </label>
            <select
              id="issue-category"
              className="field mt-1 w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value as IssueCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <label htmlFor="issue-details" className="mt-4 block text-sm font-semibold">
              What did you notice?
            </label>
            <textarea
              id="issue-details"
              className="field mt-1 min-h-24 w-full resize-y"
              value={details}
              aria-invalid={Boolean(error)}
              aria-describedby="issue-help"
              onChange={(e) => setDetails(e.target.value)}
            />
            <p id="issue-help" className="muted mt-1 text-xs">
              Please don’t include personal or sensitive information.
            </p>
            {error && (
              <p role="alert" className="danger-text mt-2 text-sm">
                {error}
              </p>
            )}

            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--brand)]"
                checked={includeText}
                onChange={(e) => setIncludeText(e.target.checked)}
              />
              Include my input and model result to help review this issue.
            </label>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
                {status === "sending" ? (
                  <>
                    <span className="spinner" aria-hidden /> Sending…
                  </>
                ) : (
                  <>
                    <Check size={16} aria-hidden /> Send feedback
                  </>
                )}
              </button>
            </div>
            <p className="muted mt-3 text-center text-xs">
              Feedback is currently a local demo and is not used for model training.
            </p>
          </form>
        )}
      </div>
    </dialog>
  );
}