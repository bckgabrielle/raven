from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from .data import VideoRecord, normalize_gloss, read_split


class SignCatalog:
    def __init__(self, records: list[VideoRecord]) -> None:
        entries: dict[str, list[VideoRecord]] = defaultdict(list)
        for record in records:
            entries[normalize_gloss(record.gloss)].append(record)
        self._entries = dict(entries)

    @classmethod
    def from_csv(cls, csv_path: Path) -> "SignCatalog":
        return cls(read_split(csv_path))

    def lookup(self, query: str) -> list[VideoRecord]:
        normalized = normalize_gloss(query)
        return list(self._entries.get(normalized, ())) if normalized else []

    def search(self, query: str, limit: int = 20) -> list[str]:
        normalized = normalize_gloss(query)
        if not normalized:
            return []
        matches = [
            records[0].gloss
            for key, records in sorted(self._entries.items())
            if normalized in key
        ]
        return matches[:limit]

    def find_video(self, video_file: str) -> VideoRecord | None:
        for records in self._entries.values():
            for record in records:
                if record.video_file == video_file:
                    return record
        return None
