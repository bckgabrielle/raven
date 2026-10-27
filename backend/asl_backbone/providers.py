from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError, field_validator


class ProviderError(RuntimeError):
    pass


class GlossDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    glosses: list[StrictStr] = Field(min_length=1, max_length=8)

    @field_validator("glosses")
    @classmethod
    def validate_glosses(cls, glosses: list[str]) -> list[str]:
        cleaned: list[str] = []
        for gloss in glosses:
            value = " ".join(gloss.split()).upper()
            if not value or len(value) > 100 or not re.fullmatch(r"[A-Z0-9][A-Z0-9 '’-]*", value):
                raise ValueError("Each gloss must be a non-empty gloss label.")
            cleaned.append(value)
        return cleaned


@dataclass(frozen=True)
class ProviderSettings:
    provider: str
    base_url: str
    token: str
    model: str

    @classmethod
    def from_env(cls) -> "ProviderSettings":
        provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()
        if provider == "groq":
            return cls(
                provider=provider,
                base_url="https://api.groq.com/openai/v1",
                token=os.getenv("GROQ_API_KEY", "").strip(),
                model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant").strip(),
            )
        if provider == "meterless":
            return cls(
                provider=provider,
                base_url=os.getenv("METERLESS_BASE_URL", "http://127.0.0.1:8088/v1").rstrip("/"),
                token=os.getenv("METERLESS_API_TOKEN", "").strip(),
                model=os.getenv("METERLESS_MODEL", "nightshift").strip(),
            )
        raise ValueError("LLM_PROVIDER must be either 'groq' or 'meterless'.")


def active_provider_name() -> str:
    return ProviderSettings.from_env().provider


def reported_provider_name() -> str:
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()
    return provider if provider in {"groq", "meterless"} else "invalid_configuration"


def provider_configuration() -> dict[str, object]:
    selected = reported_provider_name()
    return {
        "active": selected,
        "groq": {"configured": bool(os.getenv("GROQ_API_KEY", "").strip())},
        "meterless": {
            "configured": bool(os.getenv("METERLESS_API_TOKEN", "").strip()),
        },
    }


def draft_glosses(text: str) -> GlossDraft:
    settings = ProviderSettings.from_env()
    if not settings.token:
        raise ProviderError(f"{settings.provider} is selected but its API token is not configured.")
    if not settings.model:
        raise ProviderError(f"{settings.provider} model name is empty.")

    timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
    if not 1 <= timeout <= 120:
        raise ProviderError("LLM_TIMEOUT_SECONDS must be between 1 and 120.")

    payload = {
        "model": settings.model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Draft a short sequence of ASL-Citizen gloss labels for the input text. "
                    'Return only valid JSON with exactly this shape: {"glosses":["GLOSS"]}. '
                    "Do not explain, translate into prose, or invent motion data."
                ),
            },
            {"role": "user", "content": text},
        ],
    }
    request = Request(
        f"{settings.base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        raise ProviderError(f"{settings.provider} request failed: {error}") from error

    try:
        completion = json.loads(response_body)
        content = completion["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("completion content must be a string")
        return GlossDraft.model_validate_json(content)
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as error:
        raise ProviderError(f"{settings.provider} returned invalid gloss JSON.") from error
