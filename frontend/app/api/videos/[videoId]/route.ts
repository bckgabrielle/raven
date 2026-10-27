import { getBackendUrl } from "@/lib/backend";

export async function GET(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  if (
    videoId.length > 255 ||
    !videoId.toLowerCase().endsWith(".mp4") ||
    videoId.includes("/") ||
    videoId.includes("\\") ||
    videoId === "." ||
    videoId === ".."
  ) {
    return Response.json({ error: "Reference video not found." }, { status: 404 });
  }

  const range = request.headers.get("range");
  let backendResponse: Response;
  try {
    backendResponse = await fetch(
      getBackendUrl(`/v1/videos/${encodeURIComponent(videoId)}`),
      {
        headers: range ? { Range: range } : undefined,
        cache: "no-store",
        signal: request.signal,
      },
    );
  } catch {
    return Response.json({ error: "The model API could not be reached." }, { status: 502 });
  }

  if (!backendResponse.ok && backendResponse.status !== 206) {
    return Response.json(
      { error: backendResponse.status === 404 ? "Reference video not found." : "Could not load reference video." },
      { status: backendResponse.status },
    );
  }

  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["accept-ranges", "content-length", "content-range", "content-type"]) {
    const value = backendResponse.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers,
  });
}
