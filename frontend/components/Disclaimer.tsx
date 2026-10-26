import { Info } from "lucide-react";

export default function Disclaimer() {
  return (
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