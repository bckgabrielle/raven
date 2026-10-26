export const MAX_CHARS = 500;
export const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const EXAMPLE_TEXT = "APPLE";

export interface TextStatus {
  ok: boolean;
  tone: "idle" | "ok" | "error";
  message: string;
}

export function checkText(text: string): TextStatus {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, tone: "idle", message: "Enter one ASL gloss to search." };
  }
  if (text.length > MAX_CHARS) {
    return {
      ok: false,
      tone: "error",
      message: `Too long by ${text.length - MAX_CHARS} characters. The limit is ${MAX_CHARS}.`,
    };
  }
  return {
    ok: true,
    tone: "ok",
    message: "Ready to find an exact gloss match.",
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

export function checkVideoFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".mp4")) {
    return "This file type isn’t supported. Choose an MP4 sign video.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "This video is larger than 50 MB. Choose a smaller MP4.";
  }
  if (file.size === 0) {
    return "This video is empty. Choose another file.";
  }
  return null;
}