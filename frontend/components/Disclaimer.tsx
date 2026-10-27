import { Info } from "lucide-react";

export default function Disclaimer() {
  return (
    <aside id="about" role="note" className="alert alert-brand flex items-start gap-3 rounded-2xl">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--leaf-soft)]">
        <Info size={18} className="brand-text" aria-hidden />
      </span>
      <p className="muted leading-relaxed">
        <strong className="text-[var(--ink)]">A prototype, not an interpreter.</strong> AI-generated
        ASL may be inaccurate. ASL has its own grammar and expression; it is not word-for-word
        English. Not for critical communication.
    <aside id="about" role="note" className="alert alert-brand flex items-start gap-3">
      <Info size={18} className="brand-text mt-0.5 shrink-0" aria-hidden />
      <p className="muted">
        <strong className="text-[var(--ink)]">A research prototype, not an interpreter.</strong>{" "}
        Groq drafts and transcriptions may be wrong and have not been reviewed by Deaf ASL experts.
        Avatar playback reuses isolated sign pose tracks and experimental rig demos; it does not
        provide validated sentence grammar or facial/non-manual signing. Do not use for critical
        communication.
      </p>
    </aside>
  );
}