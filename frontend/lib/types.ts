export type Stage = "idle" | "processing" | "ready" | "error";
export type MobileTab = "input" | "preview";
export type IssueCategory =
  | "fingerspelling"
  | "sign"
  | "timing"
  | "unsupported"
  | "playback";

export interface SignReference {
  gloss: string;
  aslLexCode: string;
  videoId: string;
  videoUrl: string;
}

export interface ReferenceResult {
  kind: "reference";
  status: "reference_only" | "unsupported";
  supported: boolean;
  text: string;
  modelVersion: string;
  warning: string;
  sequence: SignReference[];
}

export interface SignPrediction {
  gloss: string;
  confidence: number;
}

export interface RecognitionResult {
  kind: "recognition";
  text: string;
  modelVersion: string;
  warning: string;
  predictions: SignPrediction[];
}

export type TranslationResult = ReferenceResult | RecognitionResult;

export interface FeedbackReport {
  category: IssueCategory;
  details: string;
  playbackTimeSec: number;
  modelVersion: string;
  englishText?: string;
}
