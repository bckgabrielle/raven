import { getBackendUrl } from "@/lib/backend";

export async function GET(
  request: Request,
  context: { params: Promise<{ letter: string; index: string }> },
) {
  const { letter, index } = await context.params;
  if (!/^[A-Za-z]$/.test(letter) || !/^(0|[1-9]\d*)$/.test(index)) {
    return Response.json({ error: "Alphabet sample not found." }, { status: 404 });
  }

  let response: Response;
  try {
    response = await fetch(
      getBackendUrl(`/v1/alphabet/${encodeURIComponent(letter)}/samples/${index}`),
      { cache: "no-store", signal: request.signal },
    );
  } catch {
    return Response.json({ error: "The model API could not be reached." }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json(
      { error: response.status === 404 ? "Alphabet sample not found." : "Could not load the alphabet sample." },
      { status: response.status },
    );
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !["image/jpeg", "image/png"].includes(contentType.split(";")[0])) {
    return Response.json({ error: "The model API returned an unsupported image." }, { status: 502 });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
    },
  });
}
