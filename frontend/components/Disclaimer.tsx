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
      </p>
    </aside>
  );
}