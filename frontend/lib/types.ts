export type Stage = "idle" | "processing" | "ready" | "error";
export type MobileTab = "input" | "preview";
export type IssueCategory =
  | "fingerspelling"
  | "sign"
  | "timing"
  | "unsupported"
  | "playback";

// Shape the back end should return from POST /api/translate.
// Confirm the final contract with Mitchelle and Hadassah.
export interface TranslationResult {
  text: string;
  durationSec: number;
  modelVersion: string;
  fingerspelled: string[];
  unsupported: string[];
}

export interface FeedbackReport {
  category: IssueCategory;
  details: string;
  playbackTimeSec: number;
  modelVersion: string;
  englishText?: string; // only sent when the user ticks "include my text"
}