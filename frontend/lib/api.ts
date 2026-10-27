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
}
