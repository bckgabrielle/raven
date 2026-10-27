"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw } from "lucide-react";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

interface AlphabetLetter {
  letter: string;
  sample_count: number;
}

interface AlphabetDataset {
  available: boolean;
  source: string;
  letters: AlphabetLetter[];
}

function isAlphabetDataset(value: unknown): value is AlphabetDataset {
  if (typeof value !== "object" || value === null) return false;
  const dataset = value as Partial<AlphabetDataset>;
  return (
    typeof dataset.available === "boolean" &&
    typeof dataset.source === "string" &&
    Array.isArray(dataset.letters) &&
    dataset.letters.every(
      (letter) =>
        typeof letter === "object" &&
        letter !== null &&
        typeof letter.letter === "string" &&
        typeof letter.sample_count === "number",
    )
  );
}

async function fetchAlphabetDataset(): Promise<AlphabetDataset> {
  const response = await fetch("/api/alphabet", { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Could not load the ASL alphabet practice dataset.";
    throw new Error(message);
  }
  if (!isAlphabetDataset(payload)) {
    throw new Error("The alphabet dataset API returned an unexpected response.");
  }
  return payload;
}

export default function AlphabetPractice() {
  const [dataset, setDataset] = useState<AlphabetDataset | null>(null);
  const [selectedLetter, setSelectedLetter] = useState("A");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [answerHidden, setAnswerHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchAlphabetDataset()
      .then((payload) => {
        if (!active) return;
        setDataset(payload);
        setSelectedLetter((current) =>
          payload.letters.some((entry) => entry.letter === current)
            ? current
            : payload.letters[0]?.letter ?? "A",
        );
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load alphabet examples.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedSamples =
    dataset?.letters.find((entry) => entry.letter === selectedLetter)?.sample_count ?? 0;

  function chooseLetter(letter: string) {
    setSelectedLetter(letter);
    setSampleIndex(0);
    setAnswerHidden(false);
  }

  function changeSample(direction: -1 | 1) {
    if (selectedSamples < 1) return;
    setSampleIndex((current) => (current + direction + selectedSamples) % selectedSamples);
    setAnswerHidden(false);
  }

  function retryLoadDataset() {
    setDataset(null);
    setLoading(true);
    setError("");
    void fetchAlphabetDataset()
      .then((payload) => {
        setDataset(payload);
        setSelectedLetter((current) =>
          payload.letters.some((entry) => entry.letter === current)
            ? current
            : payload.letters[0]?.letter ?? "A",
        );
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load alphabet examples.");
      })
      .finally(() => setLoading(false));
  }

  return (
    <section id="practice" className="card mb-6" aria-labelledby="alphabet-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-text text-sm font-semibold">Start with the ASL alphabet</p>
          <h2 id="alphabet-title" className="mt-1 text-2xl font-semibold">
            Practice fingerspelling
          </h2>
          <p className="muted mt-2 max-w-2xl text-sm">
            Choose a letter, study an image example, and hide the answer to quiz yourself. These
            are image references for practice, not animated signs or expert-reviewed instruction.
          </p>
        </div>
        <a
          className="btn btn-ghost text-sm"
          href="https://www.kaggle.com/datasets/chaitanyakakade77/american-sign-language-dataset"
          target="_blank"
          rel="noreferrer"
        >
          Dataset source
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div>
          <p className="mb-3 text-sm font-medium">Choose a letter</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-9" role="group" aria-label="ASL alphabet letters">
            {ALPHABET.map((letter) => {
              const hasSamples = dataset?.letters.some((entry) => entry.letter === letter) ?? false;
              const isSelected = selectedLetter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  className={`grid aspect-square place-items-center rounded-lg border text-lg font-semibold transition-colors ${
                    isSelected && !answerHidden
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--navy)]"
                      : "border-[var(--line)] bg-white hover:border-[var(--accent)]"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  aria-pressed={isSelected}
                  aria-label={
                    answerHidden && isSelected
                      ? "Selected letter, answer hidden"
                      : `${letter}${dataset && !hasSamples ? ", no image samples available" : ""}`
                  }
                  disabled={Boolean(dataset?.available && !hasSamples)}
                  onClick={() => chooseLetter(letter)}
                >
                  {answerHidden && isSelected ? "?" : letter}
                </button>
              );
            })}
          </div>
          <div className="muted mt-4 rounded-lg bg-[var(--surface)] p-3 text-sm">
            <p className="font-medium text-[var(--ink)]">How to use this practice</p>
            <ol className="mt-1 list-inside list-decimal space-y-1">
              <li>Select a letter to see a dataset image.</li>
              <li>Hide the answer and try to name the handshape.</li>
              <li>Move through more examples for the same letter.</li>
            </ol>
          </div>
        </div>

        <div className="flex min-h-80 flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="muted text-sm">
              {selectedSamples > 0
                ? `Example ${sampleIndex + 1} of ${selectedSamples}`
                : "Alphabet image example"}
            </p>
            {selectedSamples > 0 && (
              <button
                type="button"
                className="btn btn-ghost text-sm"
                aria-pressed={answerHidden}
                onClick={() => setAnswerHidden((hidden) => !hidden)}
              >
                {answerHidden ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}
                {answerHidden ? "Reveal answer" : "Hide answer"}
              </button>
            )}
          </div>

          <div className="my-3 grid min-h-56 flex-1 place-items-center overflow-hidden rounded-lg bg-white p-3">
            {loading ? (
              <p className="muted" role="status">Loading alphabet examples…</p>
            ) : error ? (
              <div className="text-center">
                <p className="danger-text text-sm" role="alert">{error}</p>
                <button type="button" className="btn btn-ghost mt-3" onClick={retryLoadDataset}>
                  <RefreshCw size={16} aria-hidden /> Try again
                </button>
              </div>
            ) : selectedSamples > 0 ? (
              <Image
                key={`${selectedLetter}-${sampleIndex}`}
                src={`/api/alphabet/${selectedLetter}/${sampleIndex}`}
                alt={
                  answerHidden
                    ? "Practice image. Reveal the answer to check the selected letter."
                    : `ASL alphabet handshape example for ${selectedLetter}`
                }
                width={480}
                height={360}
                unoptimized
                className="max-h-72 w-auto max-w-full object-contain"
              />
            ) : (
              <div className="max-w-sm p-4 text-center">
                <p className="text-5xl font-semibold text-[var(--navy)]" aria-hidden>
                  {selectedLetter}
                </p>
                <p className="muted mt-3 text-sm">
                  {dataset?.available
                    ? `No image examples are available for ${selectedLetter}.`
                    : "Connect the optional Kaggle alphabet dataset to see image examples here."}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-2xl font-semibold" aria-live="polite">
              {answerHidden && selectedSamples > 0 ? "?" : selectedLetter}
            </p>
            {selectedSamples > 1 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Previous image example"
                  onClick={() => changeSample(-1)}
                >
                  <ChevronLeft size={18} aria-hidden /> Previous
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Next image example"
                  onClick={() => changeSample(1)}
                >
                  Next <ChevronRight size={18} aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="muted mt-4 text-xs">
        Image examples from the{" "}
        <a
          className="underline"
          href="https://www.kaggle.com/datasets/chaitanyakakade77/american-sign-language-dataset"
          target="_blank"
          rel="noreferrer"
        >
          American Sign Language Dataset on Kaggle
        </a>
        . Download and licensing are managed separately; Raven does not redistribute the dataset.
      </p>
    </section>
  );
}
