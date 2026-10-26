import { getBackendUrl } from "@/lib/backend";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".flac",
  ".mp3",
  ".mp4",
  ".m4a",
  ".mpeg",
  ".mpga",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
]);

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return Response.json({ error: "Audio uploads are limited to 25 MB." }, { status: 413 });
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return Response.json({ error: "Upload a supported audio recording." }, { status: 400 });
  }

  const file = incoming.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an audio file to transcribe." }, { status: 400 });
  }
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return Response.json(
      { error: "Use WAV, MP3, M4A, OGG, FLAC, MP4, or WebM audio." },
      { status: 415 },
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio uploads are limited to 25 MB." }, { status: 413 });
  }

  const forwarded = new FormData();
  forwarded.append("audio", file, file.name);
  let response: Response;
  try {
    response = await fetch(getBackendUrl("/v1/transcribe"), {
      method: "POST",
      body: forwarded,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json({ error: "Transcription timed out. Try a shorter recording." }, { status: 504 });
    }
    return Response.json(
      { error: "The backend could not be reached. Check ASL_BACKEND_URL." },
      { status: 502 },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return Response.json({ error: "The transcription service returned invalid data." }, { status: 502 });
  }
  if (!response.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : "Audio transcription failed.";
    return Response.json({ error: detail }, { status: response.status });
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("text" in payload) ||
    typeof payload.text !== "string" ||
    !payload.text.trim()
  ) {
    return Response.json({ error: "The transcription service returned an empty transcript." }, { status: 502 });
  }
  return Response.json({ text: payload.text, model: "Groq speech-to-text" });
}
