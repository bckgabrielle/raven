import { Info } from "lucide-react";

export default function Disclaimer() {
  return (
    <aside id="about" role="note" className="alert alert-brand flex items-start gap-3">
      <Info size={18} className="brand-text mt-0.5 shrink-0" aria-hidden />
      <p className="muted">
        <strong className="text-[var(--ink)]">A prototype, not an interpreter.</strong> AI-generated
        ASL may be inaccurate. ASL has its own grammar and expression; it is not word-for-word
        English. Not for critical communication.
      </p>
    </aside>
  );
}