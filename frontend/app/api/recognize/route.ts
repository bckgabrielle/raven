import { getBackendUrl } from "@/lib/backend";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function isPrediction(value: unknown): value is { gloss: string; confidence: number } {
  if (typeof value !== "object" || value === null) return false;
  const prediction = value as { gloss?: unknown; confidence?: unknown };
  return (
    typeof prediction.gloss === "string" &&
    typeof prediction.confidence === "number" &&
    Number.isFinite(prediction.confidence) &&
    prediction.confidence >= 0 &&
    prediction.confidence <= 1
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_VIDEO_BYTES + 1024 * 1024) {
    return Response.json({ error: "Choose a video smaller than 50 MB." }, { status: 413 });
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return Response.json({ error: "Upload a supported video file." }, { status: 400 });
  }

  const file = incoming.get("video");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a video file to recognize." }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return Response.json({ error: "Choose a video smaller than 50 MB." }, { status: 413 });
  }
  if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
    return Response.json({ error: "The model currently accepts MP4 video files." }, { status: 415 });
  }

  const forwarded = new FormData();
  forwarded.append("video", file, file.name);

  let backendResponse: Response;
  try {
    backendResponse = await fetch(getBackendUrl("/v1/recognize?top_k=5"), {
      method: "POST",
      body: forwarded,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json({ error: "Video recognition timed out. Try a shorter clip." }, { status: 504 });
    }
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
        : "The model API could not recognize this video.";
    return Response.json({ error: detail }, { status: backendResponse.status });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("predictions" in payload) ||
    !Array.isArray(payload.predictions) ||
    !payload.predictions.every(isPrediction)
  ) {
    return Response.json({ error: "The model API returned an unexpected response." }, { status: 502 });
  }

  return Response.json({
    kind: "recognition",
    text: file.name,
    modelVersion: "asl-citizen-video-gloss-v1",
    warning:
      "This model recognizes one isolated sign, not an English phrase or a fluent ASL sentence.",
    predictions: payload.predictions,
  });
}
