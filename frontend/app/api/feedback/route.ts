export async function POST() {
  return Response.json(
    { error: "Feedback storage is not connected in this prototype." },
    { status: 501 },
  );
}
