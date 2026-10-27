"use client";

import { useEffect, useState } from "react";

interface ProviderStatusResponse {
  active_gloss_provider: "groq" | "meterless" | "invalid_configuration";
  providers: {
    groq: { configured: boolean };
    meterless: { configured: boolean };
  };
  zetaris: { configured: boolean; available: boolean | null };
}

const API_URL = (process.env.NEXT_PUBLIC_RAVEN_API_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

function providerLabel(provider: string): string {
  if (provider === "meterless") return "Meterless Nightshift";
  if (provider === "groq") return "Groq";
  return "Invalid provider configuration";
}

export default function ProviderStatus() {
  const [status, setStatus] = useState<ProviderStatusResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/v1/provider-status`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Provider status request failed.");
        return response.json() as Promise<ProviderStatusResponse>;
      })
      .then(setStatus)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setUnavailable(true);
      });
    return () => controller.abort();
  }, []);

  const activeProvider = status ? providerLabel(status.active_gloss_provider) : "Unknown";
  const providerConfigured = status && status.active_gloss_provider !== "invalid_configuration"
    ? status.providers[status.active_gloss_provider].configured
    : false;
  const zetarisState = !status
    ? unavailable
      ? "Status unavailable"
      : "Checking…"
    : !status.zetaris.configured
      ? "Not configured; using local files"
      : status.zetaris.available === false
        ? "Unavailable; using local files"
        : status.zetaris.available === true
          ? "Connected"
          : "Configured";

  return (
    <section className="alert alert-brand mb-5" aria-label="Integration status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <p>
          <strong>Active gloss provider:</strong>{" "}
          {status ? `${activeProvider}${providerConfigured ? "" : " (not configured)"}` : activeProvider}
        </p>
        <p>
          <strong>Zetaris catalog:</strong> {zetarisState}
        </p>
      </div>
      <p className="alert alert-warn mt-3">
        <strong>Unreviewed draft:</strong> AI-generated gloss suggestions require review by a
        qualified ASL reviewer and are not a validated translation.
      </p>
    </section>
  );
}
