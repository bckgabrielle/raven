import { Info } from "lucide-react";

export default function Disclaimer() {
  return (
    <aside id="about" role="note" className="alert alert-brand flex items-start gap-3">
      <Info size={18} className="brand-text mt-0.5 shrink-0" aria-hidden />
      <p className="muted">
        <strong className="text-[var(--ink)]">A research prototype, not an interpreter.</strong>{" "}
        The model recognizes isolated signs and can show recorded examples for exact glosses. It
        does not translate English sentences or generate avatar motion. Predictions may be wrong;
        do not use for critical communication.
      </p>
    </aside>
  );
}