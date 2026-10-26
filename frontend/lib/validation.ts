export const MAX_CHARS = 500;
export const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
export const EXAMPLE_TEXT =
  "Hello! My name is Maya. I’m learning ASL. It’s nice to meet you.";

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export interface TextStatus {
  ok: boolean;
  tone: "idle" | "ok" | "error";
  message: string;
}

export function checkText(text: string): TextStatus {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, tone: "idle", message: "Type or paste some English to begin." };
  }
  if (text.length > MAX_CHARS) {
    return {
      ok: false,
      tone: "error",
      message: `Too long by ${text.length - MAX_CHARS} characters. The limit is ${MAX_CHARS}.`,
    };
  }
  const n = splitSentences(trimmed).length;
  return {
    ok: true,
    tone: "ok",
    message: `Ready to translate · ${n} short sentence${n === 1 ? "" : "s"}`,
  };
}

// Returns an error message, or null when the file is acceptable.
export function checkFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return "This file type isn’t supported. Choose a .txt file, or paste your text instead.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "This file is larger than 1 MB. Choose a smaller .txt file.";
  }
  return null;
}

export function checkFileText(content: string): string | null {
  if (!content.trim()) return "This file is empty. Choose a file that contains text.";
  if (content.trim().length > MAX_CHARS) {
    return `This file has ${content.trim().length} characters. The limit is ${MAX_CHARS}.`;
  }
  return null;
}