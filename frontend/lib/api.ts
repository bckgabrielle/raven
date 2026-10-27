import type { FeedbackReport, TranslationResult } from "./types";
import { splitSentences } from "./validation";

// Mock mode is ON unless .env.local sets NEXT_PUBLIC_USE_MOCK=false
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
export const STEP_MS = 1400;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function mockResult(text: string): TranslationResult {
  const sentences = splitSentences(text);
  const names = new Set<string>();
  sentences.forEach((s) =>
    s
      .split(/\s+/)
      .slice(1)
      .forEach((w) => {
        const word = w.replace(/[^A-Za-z]/g, "");
        if (/^[A-Z][a-z]{2,}$/.test(word)) names.add(word);
      }),
  );
  return {
    text,
    durationSec: Math.max(6, sentences.length * 3),
    modelVersion: "Demo model v0.3",
    fingerspelled: Array.from(names),
    unsupported: [],
  };
}

export async function translateToAsl(
  text: string,
  signal: AbortSignal,
): Promise<TranslationResult> {
  if (USE_MOCK) {
    await wait(STEP_MS * 3, signal);
    // Type the word "fail" in the box to preview the error state.
    if (/\bfail\b/i.test(text)) {
      throw new Error("The demo model couldn’t process this text.");
    }
    return mockResult(text);
  }
  const res = await fetch("/api/translate", {
import type {
  FeedbackReport,
  RecognitionResult,
  TranslationDraft,
  TranslationResult,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTranslationResult(value: unknown): value is TranslationResult {
  if (!isRecord(value) || typeof value.text !== "string" || typeof value.modelVersion !== "string") {
    return false;
  }
  if (value.kind === "translation") {
    return (
      value.status === "draft" &&
      (value.translationSource === "groq_unreviewed" ||
        value.translationSource === "local_word_lookup") &&
      value.reviewStatus === "unreviewed" &&
      typeof value.modelVersion === "string" &&
      Array.isArray(value.glosses) &&
      value.glosses.every((gloss) => typeof gloss === "string") &&
      Array.isArray(value.sequence) &&
      value.sequence.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.gloss === "string" &&
          typeof entry.supported === "boolean" &&
          (entry.poseUrl === null || typeof entry.poseUrl === "string") &&
          (entry.reference === null ||
            (isRecord(entry.reference) &&
              typeof entry.reference.gloss === "string" &&
              typeof entry.reference.aslLexCode === "string" &&
              typeof entry.reference.videoId === "string" &&
              typeof entry.reference.videoUrl === "string")),
      ) &&
      Array.isArray(value.unsupportedGlosses) &&
      value.unsupportedGlosses.every((gloss) => typeof gloss === "string") &&
      Array.isArray(value.warnings) &&
      value.warnings.every((warning) => typeof warning === "string")
    );
  }
  return (
    value.kind === "recognition" &&
    typeof value.warning === "string" &&
    Array.isArray(value.predictions) &&
    value.predictions.every(
      (prediction) =>
        isRecord(prediction) &&
        typeof prediction.gloss === "string" &&
        typeof prediction.confidence === "number" &&
        Number.isFinite(prediction.confidence) &&
        prediction.confidence >= 0 &&
        prediction.confidence <= 1,
    )
  );
}

async function readResult(response: Response, failureMessage: string): Promise<TranslationResult> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The model service returned an invalid response.");
  }
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : failureMessage;
    throw new Error(message);
  }
  if (!isTranslationResult(payload)) {
    throw new Error("The model service returned an unexpected result.");
  }
  return payload;
}

export async function translateText(
  text: string,
  signal: AbortSignal,
): Promise<TranslationDraft> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error("The translation service didn’t respond.");
  return (await res.json()) as TranslationResult;
}

export async function sendFeedback(report: FeedbackReport): Promise<void> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  const res = await fetch("/api/feedback", {
  const result = await readResult(response, "The gloss draft couldn’t be generated.");
  if (result.kind !== "translation") {
    throw new Error("The model service returned the wrong result type.");
  }
  return result;
}

export async function transcribeAudio(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  const body = new FormData();
  body.append("audio", file);
  const response = await fetch("/api/transcribe", {
    method: "POST",
    body,
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The transcription service returned invalid data.");
  }
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "The audio could not be transcribed.";
    throw new Error(message);
  }
  if (!isRecord(payload) || typeof payload.text !== "string" || !payload.text.trim()) {
    throw new Error("The transcription service returned an empty transcript.");
  }
  return payload.text.trim();
}

export async function recognizeSignVideo(
  file: File,
  signal: AbortSignal,
): Promise<RecognitionResult> {
  const body = new FormData();
  body.append("video", file);
  const response = await fetch("/api/recognize", {
    method: "POST",
    body,
    signal,
  });
  const result = await readResult(response, "The sign video couldn’t be recognized.");
  if (result.kind !== "recognition") {
    throw new Error("The model service returned the wrong result type.");
  }
  return result;
}

const MOCK_FEEDBACK = process.env.NEXT_PUBLIC_MOCK_FEEDBACK !== "false";

export async function sendFeedback(report: FeedbackReport): Promise<void> {
  if (MOCK_FEEDBACK) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error("We couldn’t send your feedback.");
}
  if (!response.ok) throw new Error("We couldn’t send your feedback.");
}
