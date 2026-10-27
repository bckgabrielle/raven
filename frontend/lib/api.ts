import type { TranslationResult, GlossEntry } from "./types";

export const STEP_MS = 800;

const API_URL = (
  process.env.NEXT_PUBLIC_RAVEN_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export interface FeedbackPayload {
  resultId: string;
  category: string;
  details: string;
  playbackTimeSec: number;
  modelVersion: string;
  englishText?: string;
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
  signal?: AbortSignal
): Promise<TranslationResult> {
  const createResponse = await fetch(`${API_URL}/v1/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!createResponse.ok) {
    throw new Error(`Failed to start translation: ${createResponse.status}`);
  }
  const created = (await createResponse.json()) as {
    request_id: string;
    status: string;
  };

  let request: {
    status: string;
    result_id?: string;
    error?: string | null;
  };
  request = await pollRequest(created.request_id, signal);
  while (request.status === "queued" || request.status === "processing") {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 500));
    request = await pollRequest(created.request_id, signal);
  }

  if (request.status === "failed") {
    throw new Error(request.error || "Translation request failed.");
  }

  if (!request.result_id) {
    throw new Error("Translation request did not produce a result.");
  }

  const resultResponse = await fetch(
    `${API_URL}/v1/results/${request.result_id}`,
    { signal }
  );
  if (!resultResponse.ok) {
    throw new Error(`Failed to fetch result: ${resultResponse.status}`);
  }
  const backend = (await resultResponse.json()) as BackendResult;

  return transformBackendResult(backend, request.result_id);
}

async function pollRequest(
  requestId: string,
  signal?: AbortSignal
): Promise<{ status: string; result_id?: string; error?: string | null }> {
  const response = await fetch(`${API_URL}/v1/requests/${requestId}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to check request status: ${response.status}`);
  }
  const data = (await response.json()) as {
    status: string;
    result_id?: string;
    error?: string | null;
  };
  return data;
}

interface BackendResult {
  schema_version: string;
  request_id: string;
  source_text: string;
  status: string;
  supported: boolean;
  plan_version: string;
  motion_data_version: string | null;
  model_version: string;
  sequence: Array<{
    index: number;
    gloss: string;
    asl_lex_code: string;
    video_id: string;
    video_url: string;
  }>;
  motion_data: unknown;
  gloss_provider: string;
  draft_status: string;
  warning: string | null;
  result_id: string;
  result_url: string;
}

function transformBackendResult(backend: BackendResult, resultId: string): TranslationResult {
  const sequence: GlossEntry[] = (backend.sequence ?? []).map((entry) => ({
    index: entry.index,
    gloss: entry.gloss,
    aslLexCode: entry.asl_lex_code,
    videoId: entry.video_id,
    videoUrl: entry.video_url,
  }));

  const durationSec = sequence.length > 0 ? sequence.length * 1.5 : 3.0;

  const fingerspelled = extractNames(backend.source_text);
  const unsupported = backend.supported ? [] : [backend.source_text];

  return {
    id: resultId,
    text: backend.source_text,
    modelVersion: backend.model_version,
    durationSec,
    fingerspelled,
    unsupported,
    glossProvider: backend.gloss_provider,
    draftStatus: backend.draft_status as "unreviewed" | "not_created",
    warning: backend.warning,
    sequence,
    supported: backend.supported,
  };
}

function extractNames(text: string): string[] {
  if (!text) return [];
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[.,;:!?]/g, "");
      if (i > 0 && /^[A-Z][a-z]+$/.test(word) && !seen.has(word)) {
        seen.add(word);
        names.push(word);
      }
    }
  }
  return names;
}

export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  const response = await fetch(
    `${API_URL}/v1/results/${payload.resultId}/feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: mapCategory(payload.category),
        message: buildMessage(payload),
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Feedback submission failed: ${response.status}`);
  }
}

function mapCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    fingerspelling: "unclear",
    sign: "incorrect",
    timing: "incorrect",
    unsupported: "incorrect",
    playback: "other",
  };
  return categoryMap[category] ?? "other";
}

function buildMessage(payload: FeedbackPayload): string {
  const parts: string[] = [];
  parts.push(`Category: ${payload.category}.`);
  parts.push(`Details: ${payload.details}`);
  parts.push(`Playback time: ${payload.playbackTimeSec}s.`);
  parts.push(`Model version: ${payload.modelVersion}.`);
  if (payload.englishText) {
    parts.push(`English text: ${payload.englishText}`);
  }
  return parts.join(" ");
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
