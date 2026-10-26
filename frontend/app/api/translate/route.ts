import { getBackendUrl } from "@/lib/backend";

interface BackendReference {
  gloss: string;
  asl_lex_code: string;
  video_id: string;
}

interface BackendPlan {
  status: "reference_only" | "unsupported";
  supported: boolean;
  source_text: string;
  sequence: BackendReference[];
  warning: string;
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

function isBackendPlan(value: unknown): value is BackendPlan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Partial<BackendPlan>;
  return (
    (plan.status === "reference_only" || plan.status === "unsupported") &&
    typeof plan.supported === "boolean" &&
    typeof plan.source_text === "string" &&
    typeof plan.warning === "string" &&
    Array.isArray(plan.sequence) &&
    plan.sequence.every(isBackendReference)
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
      { error: "Enter one gloss with no more than 1,000 characters." },
      { status: 400 },
    );
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(getBackendUrl("/v1/sign/plan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body.text }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return Response.json(
      {
        error:
          "The model API could not be reached. Start the local backend and check ASL_BACKEND_URL.",
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
        : "The model API could not process this lookup.";
    return Response.json({ error: detail }, { status: backendResponse.status });
  }

  if (!isBackendPlan(payload)) {
    return Response.json({ error: "The model API returned an unexpected response." }, { status: 502 });
  }

  return Response.json({
    kind: "reference",
    status: payload.status,
    supported: payload.supported,
    text: payload.source_text,
    modelVersion: "asl-citizen-video-gloss-v1",
    warning: payload.warning,
    sequence: payload.sequence.map((entry) => ({
      gloss: entry.gloss,
      aslLexCode: entry.asl_lex_code,
      videoId: entry.video_id,
      videoUrl: `/api/videos/${encodeURIComponent(entry.video_id)}`,
    })),
  });
}
