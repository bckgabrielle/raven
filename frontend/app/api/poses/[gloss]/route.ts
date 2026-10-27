import { getBackendUrl } from "@/lib/backend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gloss: string }> },
) {
  const { gloss } = await params;
  if (!gloss.trim() || gloss.length > 100) {
    return Response.json({ error: "Invalid gloss." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      getBackendUrl(`/v1/poses/${encodeURIComponent(gloss)}`),
      { cache: "no-store", signal: request.signal },
    );
  } catch {
    return Response.json(
      { error: "The local model API could not be reached. Start the backend and check ASL_BACKEND_URL." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    let detail = "The local pose track could not be loaded.";
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof payload.detail === "string"
      ) {
        detail = payload.detail;
      }
    } catch {
      return Response.json({ error: "The local model API returned an invalid response." }, { status: 502 });
    }
    return Response.json({ error: detail }, { status: response.status });
  }

  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
