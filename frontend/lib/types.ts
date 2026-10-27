export type MobileTab = "input" | "preview";

export type Stage = "idle" | "processing" | "ready" | "error";

export type IssueCategory = "fingerspelling" | "sign" | "timing" | "unsupported" | "playback";

export interface GlossEntry {
  index: number;
  gloss: string;
  aslLexCode: string;
  videoId: string;
  videoUrl: string;
}

export interface TranslationResult {
  id: string;
  text: string;
  modelVersion: string;
  durationSec: number;
  fingerspelled: string[];
  unsupported: string[];
  glossProvider: string;
  draftStatus: "unreviewed" | "not_created";
  warning: string | null;
  sequence: GlossEntry[];
  supported: boolean;
}
