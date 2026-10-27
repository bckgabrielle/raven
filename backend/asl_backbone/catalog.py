from __future__ import annotations

import json
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from .data import VideoRecord, normalize_gloss, read_split

logger = logging.getLogger(__name__)


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

    def list_pose_tracks(self, video_id: str) -> list[dict[str, object]]:
        return read_pose_tracks(None, video_id)


class ZetarisCatalog:
    def __init__(
        self,
        local_catalog: SignCatalog | None,
        base_url: str,
        token: str = "",
        pose_tracks_path: Path | None = None,
    ) -> None:
        self.local_catalog = local_catalog
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.pose_tracks_path = pose_tracks_path
        self.available: bool | None = None

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    def _get_json(
        self, path: str, query: dict[str, str | int] | None = None
    ) -> dict[str, Any] | None:
        if not self.configured:
            return None
        url = f"{self.base_url}/{path.lstrip('/')}"
        if query:
            url = f"{url}?{urlencode(query)}"
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(url, headers=headers)
        try:
            with urlopen(request, timeout=5) as response:
                body = response.read()
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError("Zetaris response must be a JSON object.")
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
            self.available = False
            logger.warning("Zetaris catalog request failed; using local data when available: %s", error)
            return None
        self.available = True
        return payload

    @staticmethod
    def _record(payload: Any) -> VideoRecord | None:
        if not isinstance(payload, dict):
            return None
        participant_id = payload.get("participant_id", "")
        video_file = payload.get("video_id", payload.get("video_file", ""))
        gloss = payload.get("gloss", "")
        asl_lex_code = payload.get("asl_lex_code", "")
        if not all(
            isinstance(value, str) and value.strip()
            for value in (participant_id, video_file, gloss, asl_lex_code)
        ):
            return None
        return VideoRecord(
            participant_id=participant_id.strip(),
            video_file=video_file.strip(),
            gloss=gloss.strip(),
            asl_lex_code=asl_lex_code.strip(),
        )

    def lookup(self, query: str) -> list[VideoRecord]:
        if self.configured:
            payload = self._get_json(
                "/catalog/glosses",
                {"query": query, "exact": "true"},
            )
            if payload is not None and isinstance(payload.get("records"), list):
                records = [
                    record
                    for value in payload["records"]
                    if (record := self._record(value)) is not None
                ]
                if records:
                    return records
        return self.local_catalog.lookup(query) if self.local_catalog else []

    def search(self, query: str, limit: int = 20) -> list[str]:
        if self.configured:
            payload = self._get_json(
                "/catalog/glosses",
                {"query": query, "limit": limit},
            )
            if payload is not None and isinstance(payload.get("glosses"), list):
                glosses = payload["glosses"]
                if all(isinstance(gloss, str) for gloss in glosses):
                    if glosses:
                        return glosses[:limit]
        return self.local_catalog.search(query, limit) if self.local_catalog else []

    def find_video(self, video_file: str) -> VideoRecord | None:
        if self.configured:
            payload = self._get_json(f"/catalog/videos/{quote(video_file, safe='')}")
            if payload is not None:
                record = self._record(payload.get("record"))
                if record is not None:
                    return record
        return self.local_catalog.find_video(video_file) if self.local_catalog else None

    def list_pose_tracks(self, video_id: str) -> list[dict[str, object]]:
        if self.configured:
            payload = self._get_json(
                f"/catalog/videos/{quote(video_id, safe='')}/pose-tracks"
            )
            if payload is not None and isinstance(payload.get("pose_tracks"), list):
                tracks = payload["pose_tracks"]
                if all(
                    isinstance(track, dict)
                    and isinstance(track.get("track_id"), str)
                    and isinstance(track.get("available"), bool)
                    for track in tracks
                ):
                    if tracks:
                        return [
                            {
                                "track_id": track["track_id"],
                                "available": track["available"],
                                "format": track.get("format"),
                            }
                            for track in tracks
                        ]
        return read_pose_tracks(self.pose_tracks_path, video_id)


def read_pose_tracks(
    index_path: Path | None, video_id: str
) -> list[dict[str, object]]:
    if index_path is None or not index_path.is_file():
        return []
    with index_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    entries = payload.get("tracks") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        raise ValueError(f"{index_path} must contain a list of tracks or an object with a tracks list.")

    tracks: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError(f"{index_path} contains a track that is not an object.")
        if entry.get("video_id") != video_id:
            continue
        track_id = entry.get("track_id")
        if not isinstance(track_id, str) or not track_id.strip():
            raise ValueError(f"{index_path} contains a pose track without a track_id.")
        available = entry.get("available", True)
        if not isinstance(available, bool):
            raise ValueError(f"{index_path} contains a pose track with a non-boolean available value.")
        track_path = entry.get("path")
        if isinstance(track_path, str):
            resolved_path = (index_path.parent / track_path).resolve()
            if resolved_path.parent != index_path.parent.resolve() and index_path.parent.resolve() not in resolved_path.parents:
                raise ValueError(f"{index_path} contains a pose track path outside its index directory.")
            available = available and resolved_path.is_file()
        tracks.append(
            {
                "track_id": track_id.strip(),
                "available": available,
                "format": entry.get("format") if isinstance(entry.get("format"), str) else None,
            }
        )
    return tracks
