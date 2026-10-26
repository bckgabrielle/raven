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

export interface DraftSequenceItem {
  gloss: string;
  supported: boolean;
  reference: SignReference | null;
  poseUrl: string | null;
}

export interface TranslationDraft {
  kind: "translation";
  status: "draft";
  text: string;
  translationSource: "groq_unreviewed" | "local_word_lookup";
  reviewStatus: "unreviewed";
  modelVersion: string;
  glosses: string[];
  sequence: DraftSequenceItem[];
  unsupportedGlosses: string[];
  warnings: string[];
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

export type TranslationResult = TranslationDraft | RecognitionResult;

export interface FeedbackReport {
  category: IssueCategory;
  details: string;
  playbackTimeSec: number;
  modelVersion: string;
  englishText?: string;
}
