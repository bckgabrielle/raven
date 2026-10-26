import { Hand } from "lucide-react";

export default function ProcessingSteps({
  requestKind,
}: {
  requestKind: "translation" | "transcription" | "recognition";
}) {
  const message =
    requestKind === "recognition"
      ? "Recognizing the sign in your clip…"
      : requestKind === "transcription"
        ? "Transcribing the audio…"
        : "Drafting ASL glosses and finding references…";
  return (
    <div className="rounded-xl bg-[#faf9fd] px-4 py-12 text-center md:px-6">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
        <Hand size={28} aria-hidden />
      </div>
      <h3 className="text-xl font-semibold">{message}</h3>
      <p role="status" className="muted mt-2 text-sm">
        The local model API is processing your request.
      </p>
    </div>
  );
}
