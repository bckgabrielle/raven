from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from .storage import Store


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def matched_manifest_assets(manifest: dict[str, Any], video_paths: list[Path]) -> list[str]:
    by_hash: dict[str, str] = {}
    for asset in manifest["assets"]:
        by_hash.setdefault(asset["sha256"], asset["id"])
    matched: list[str] = []
    missing: list[str] = []
    for path in video_paths:
        asset_id = by_hash.get(sha256_file(path))
        if asset_id is None:
            missing.append(path.name)
        else:
            matched.append(asset_id)
    if missing:
        raise ValueError(
            "Training videos are not in the selected dataset version: " + ", ".join(missing)
        )
    if not matched:
        raise ValueError("The selected dataset version does not cover any training videos.")
    return matched


def bind_training_videos(
    store: Store, version_id: str, video_paths: list[Path]
) -> dict[str, Any]:
    version = store.get_dataset_version(version_id)
    if version is None:
        raise ValueError(
            f"Dataset version not found: {version_id}. "
            "Create a dataset version before training."
        )
    return {
        "dataset_version_id": version["id"],
        "manifest_sha256": version["manifest_sha256"],
        "dataset_asset_ids": matched_manifest_assets(version["manifest"], video_paths),
    }
