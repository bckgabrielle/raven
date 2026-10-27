import { getBackendUrl } from "@/lib/backend";

export async function GET(request: Request) {
  let response: Response;
  try {
    response = await fetch(getBackendUrl("/v1/alphabet"), {
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return Response.json(
      { error: "The model API could not be reached. Start the backend and check ASL_BACKEND_URL." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { error: "Could not load the ASL alphabet practice dataset." },
      { status: response.status },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return Response.json({ error: "The model API returned an invalid response." }, { status: 502 });
  }

  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
