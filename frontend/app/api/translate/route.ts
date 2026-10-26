import { getBackendUrl } from "@/lib/backend";

interface BackendReference {
  gloss: string;
  asl_lex_code: string;
  video_id: string;
}

interface BackendSequenceItem {
  gloss: string;
  supported: boolean;
  reference: BackendReference | null;
  pose_url: string | null;
}

interface BackendDraft {
  status: "draft";
  source_text: string;
  translation_source: "groq_unreviewed" | "local_word_lookup";
  model_version: string;
  review_status: "unreviewed";
  glosses: string[];
  sequence: BackendSequenceItem[];
  unsupported_glosses: string[];
  warnings: string[];
}

function isBackendReference(value: unknown): value is BackendReference {
  if (typeof value !== "object" || value === null) return false;
  const reference = value as Partial<BackendReference>;
  return (
    typeof reference.gloss === "string" &&
    typeof reference.asl_lex_code === "string" &&
    typeof reference.video_id === "string"
  );
}

function isBackendSequenceItem(value: unknown): value is BackendSequenceItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<BackendSequenceItem>;
  return (
    typeof item.gloss === "string" &&
    typeof item.supported === "boolean" &&
    (item.pose_url === null || typeof item.pose_url === "string") &&
    (item.reference === null || isBackendReference(item.reference))
  );
}

function isBackendDraft(value: unknown): value is BackendDraft {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Partial<BackendDraft>;
  return (
    plan.status === "draft" &&
    typeof plan.source_text === "string" &&
    (plan.translation_source === "groq_unreviewed" ||
      plan.translation_source === "local_word_lookup") &&
    typeof plan.model_version === "string" &&
    plan.review_status === "unreviewed" &&
    Array.isArray(plan.glosses) &&
    plan.glosses.every((gloss) => typeof gloss === "string") &&
    Array.isArray(plan.sequence) &&
    plan.sequence.every(isBackendSequenceItem) &&
    Array.isArray(plan.unsupported_glosses) &&
    plan.unsupported_glosses.every((gloss) => typeof gloss === "string") &&
    Array.isArray(plan.warnings) &&
    plan.warnings.every((warning) => typeof warning === "string")
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("text" in body) ||
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.length > 1000
  ) {
    return Response.json(
      { error: "Enter text with no more than 1,000 characters." },
      { status: 400 },
    );
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(getBackendUrl("/v1/translate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body.text }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return Response.json(
      {
        error: "The model API could not be reached. Start the backend and check ASL_BACKEND_URL.",
      },
      { status: 502 },
    );
  }

  let payload: unknown;
  try {
    payload = await backendResponse.json();
  } catch {
    return Response.json({ error: "The model API returned an invalid response." }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : "The model API could not draft ASL glosses.";
    return Response.json({ error: detail }, { status: backendResponse.status });
  }

  if (!isBackendDraft(payload)) {
    return Response.json({ error: "The model API returned an unexpected response." }, { status: 502 });
  }

  return Response.json({
    kind: "translation",
    status: payload.status,
    text: payload.source_text,
    translationSource: payload.translation_source,
    reviewStatus: payload.review_status,
    modelVersion: payload.model_version,
    glosses: payload.glosses,
    unsupportedGlosses: payload.unsupported_glosses,
    warnings: payload.warnings,
    sequence: payload.sequence.map((item) => ({
      gloss: item.gloss,
      supported: item.supported,
      reference: item.reference
        ? {
            gloss: item.reference.gloss,
            aslLexCode: item.reference.asl_lex_code,
            videoId: item.reference.video_id,
            videoUrl: `/api/videos/${encodeURIComponent(item.reference.video_id)}`,
          }
        : null,
      poseUrl: item.pose_url ? `/api/poses/${encodeURIComponent(item.gloss)}` : null,
    })),
  });
}
