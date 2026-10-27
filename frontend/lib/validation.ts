export const EXAMPLE_TEXT =
  "My name is Alex. I am learning American Sign Language. Nice to meet you.";

export const MAX_CHARS = 1000;
export const MAX_FILE_BYTES = 1024 * 1024;

export interface TextStatus {
  ok: boolean;
  tone: "ok" | "error" | "warn";
  message: string;
}

export function checkText(text: string): TextStatus {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, tone: "warn", message: "Enter some text to get started." };
  }
  if (trimmed.length > MAX_CHARS) {
    return {
      ok: false,
      tone: "error",
      message: `Text exceeds the ${MAX_CHARS}-character limit.`,
    };
  }
  return { ok: true, tone: "ok", message: "Ready to translate." };
}

export function checkFile(file: File): string | null {
  const suffix = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (suffix !== ".txt") {
    return "Upload a plain-text (.txt) transcript.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "Transcript is too large; use plain text under 1 MB.";
  }
  return null;
}

export function checkFileText(content: string): string | null {
  if (content.length > MAX_CHARS) {
    return `Transcript exceeds the ${MAX_CHARS}-character limit.`;
  }
  return null;
}

export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
