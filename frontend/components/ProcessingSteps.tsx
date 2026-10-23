import { Check, Hand } from "lucide-react";

const STEPS = [
  { title: "English prepared", sub: "Text cleaned and sentences identified" },
  { title: "Building ASL motion", sub: "Planning sign order, timing, and expression" },
  { title: "Preparing your avatar", sub: "Playback will appear here when ready" },
];

export default function ProcessingSteps({ step }: { step: number }) {
  return (
    <div className="rounded-xl bg-[#faf9fd] px-4 py-8 text-center md:px-6">
      <p role="status" className="sr-only">
        Step {step + 1} of {STEPS.length}: {STEPS[step].title}
      </p>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
        <Hand size={28} aria-hidden />
      </div>
      <h3 className="text-xl font-semibold">Giving your words movement.</h3>
      <p className="muted mt-1 text-sm">We’re working from meaning, not a word-for-word substitution.</p>
      <ol className="mx-auto mt-6 max-w-sm space-y-4 text-left">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const badge = done
            ? "bg-[var(--ok-soft)] text-[var(--ok)]"
            : active
              ? "bg-[var(--brand)] text-white"
              : "border border-[var(--line)] bg-white";
          return (
            <li key={s.title} className="flex items-start gap-3" aria-current={active ? "step" : undefined}>
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${badge}`}>
                {done ? <Check size={14} aria-hidden /> : active ? <span className="spinner" aria-hidden /> : null}
              </span>
              <span>
                <span className={`block text-sm font-medium ${i > step ? "muted" : ""}`}>{s.title}</span>
                <span className="muted block text-xs">{s.sub}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="muted mt-6 text-xs">You can stay here while we prepare your preview.</p>
    </div>
  );
}