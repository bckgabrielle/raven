import type {
  FeedbackReport,
  RecognitionResult,
  ReferenceResult,
  TranslationResult,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTranslationResult(value: unknown): value is TranslationResult {
  if (!isRecord(value) || typeof value.text !== "string" || typeof value.modelVersion !== "string") {
    return false;
  }
  if (value.kind === "reference") {
    return (
      (value.status === "reference_only" || value.status === "unsupported") &&
      typeof value.supported === "boolean" &&
      typeof value.warning === "string" &&
      Array.isArray(value.sequence) &&
      value.sequence.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.gloss === "string" &&
          typeof entry.aslLexCode === "string" &&
          typeof entry.videoId === "string" &&
          typeof entry.videoUrl === "string",
      )
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

export async function lookupSignReference(
  text: string,
  signal: AbortSignal,
): Promise<ReferenceResult> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  const result = await readResult(response, "The sign lookup couldn’t be completed.");
  if (result.kind !== "reference") {
    throw new Error("The model service returned the wrong result type.");
  }
  return result;
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
  if (!response.ok) throw new Error("We couldn’t send your feedback.");
}
