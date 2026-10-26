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
  if (!response.ok) throw new Error("We couldn’t send your feedback.");
}
