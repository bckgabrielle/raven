export const EXAMPLE_TEXT =
  "My name is Alex. I am learning American Sign Language. Nice to meet you.";

export const MAX_CHARS = 1000;
export const MAX_FILE_BYTES = 1024 * 1024;

export interface TextStatus {
  ok: boolean;
  tone: "ok" | "error" | "warn";
export const MAX_CHARS = 500;
export const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
export const EXAMPLE_TEXT =
  "Hello! My name is Maya. I’m learning ASL. It’s nice to meet you.";

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const EXAMPLE_TEXT = "Hello, my name is Maya. I am learning ASL.";

export interface TextStatus {
  ok: boolean;
  tone: "idle" | "ok" | "error";
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
    return { ok: false, tone: "idle", message: "Type or paste some English to begin." };
    return { ok: false, tone: "idle", message: "Enter English text to create a gloss draft." };
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
  return {
    ok: true,
    tone: "ok",
    message: "Ready to request an unreviewed ASL gloss draft.",
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
  if (content.length > MAX_CHARS) {
    return `Transcript exceeds the ${MAX_CHARS}-character limit.`;
  if (!content.trim()) return "This file is empty. Choose a file that contains text.";
  if (content.trim().length > MAX_CHARS) {
    return `This file has ${content.trim().length} characters. The limit is ${MAX_CHARS}.`;
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

export function checkAudioFile(file: File): string | null {
  const allowed = /\.(flac|mp3|mp4|m4a|mpeg|mpga|ogg|opus|wav|webm)$/i.test(file.name);
  if (!allowed) {
    return "Use WAV, MP3, M4A, OGG, FLAC, MP4, or WebM audio.";
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return "Audio uploads are limited to 25 MB.";
  }
  if (file.size === 0) {
    return "This audio file is empty. Choose another recording.";
  }
  return null;
}
