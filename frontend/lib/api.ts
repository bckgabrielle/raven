import type { FeedbackReport, TranslationResult } from "./types";
import { splitSentences } from "./validation";

// Mock mode is ON unless .env.local sets NEXT_PUBLIC_USE_MOCK=false
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
export const STEP_MS = 1400;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function mockResult(text: string): TranslationResult {
  const sentences = splitSentences(text);
  const names = new Set<string>();
  sentences.forEach((s) =>
    s
      .split(/\s+/)
      .slice(1)
      .forEach((w) => {
        const word = w.replace(/[^A-Za-z]/g, "");
        if (/^[A-Z][a-z]{2,}$/.test(word)) names.add(word);
      }),
  );
  return {
    text,
    durationSec: Math.max(6, sentences.length * 3),
    modelVersion: "Demo model v0.3",
    fingerspelled: Array.from(names),
    unsupported: [],
  };
}

export async function translateToAsl(
  text: string,
  signal: AbortSignal,
): Promise<TranslationResult> {
  if (USE_MOCK) {
    await wait(STEP_MS * 3, signal);
    // Type the word "fail" in the box to preview the error state.
    if (/\bfail\b/i.test(text)) {
      throw new Error("The demo model couldn’t process this text.");
    }
    return mockResult(text);
  }
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error("The translation service didn’t respond.");
  return (await res.json()) as TranslationResult;
}

export async function sendFeedback(report: FeedbackReport): Promise<void> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error("We couldn’t send your feedback.");
}