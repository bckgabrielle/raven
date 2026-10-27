from __future__ import annotations

import argparse
import json
from pathlib import Path

from .data import normalize_gloss, read_split
from .pose_tracks import extract_video_pose, pose_track_path


def extract_split(
    dataset_root: Path,
    *,
    split: str = "train",
    target_fps: float = 15.0,
    limit: int | None = None,
    gloss: str | None = None,
    overwrite: bool = False,
) -> tuple[int, int]:
    if split not in {"train", "val"}:
        raise ValueError("Pose extraction is limited to the train or val split; test data is excluded.")
    if target_fps <= 0 or target_fps > 30:
        raise ValueError("target_fps must be greater than 0 and no more than 30.")

    records = read_split(dataset_root / "splits" / f"{split}.csv")
    if gloss:
        normalized = normalize_gloss(gloss)
        records = [record for record in records if normalize_gloss(record.gloss) == normalized]
        if not records:
            raise ValueError(f"Gloss not found in the {split} split: {gloss}")
    if limit is not None:
        if limit < 1:
            raise ValueError("limit must be positive.")
        records = records[:limit]

    video_root = dataset_root / "videos"
    completed = skipped = 0
    for index, record in enumerate(records, start=1):
        video_path = (video_root / record.video_file).resolve()
        if video_path.parent != video_root.resolve() or not video_path.is_file():
            raise FileNotFoundError(f"Dataset video not found: {record.video_file}")
        output_path = pose_track_path(dataset_root, record.video_file)
        if output_path.is_file() and not overwrite:
            skipped += 1
            print(f"[{index}/{len(records)}] cached {record.gloss}: {record.video_file}")
            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)
        track = extract_video_pose(video_path, gloss=record.gloss, target_fps=target_fps)
        track["video_id"] = record.video_file
        track["asl_lex_code"] = record.asl_lex_code
        temporary_path = output_path.with_suffix(".json.tmp")
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(track, file, separators=(",", ":"), allow_nan=False)
        temporary_path.replace(output_path)
        completed += 1
        print(f"[{index}/{len(records)}] extracted {record.gloss}: {record.video_file}")
    return completed, skipped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract local MediaPipe body and hand pose tracks for ASL-Citizen videos."
    )
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--split", choices=("train", "val"), default="train")
    parser.add_argument("--gloss", help="Extract only records with this exact gloss label.")
    parser.add_argument("--fps", type=float, default=15.0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    completed, skipped = extract_split(
        args.dataset_root.expanduser().resolve(),
        split=args.split,
        target_fps=args.fps,
        limit=args.limit,
        gloss=args.gloss,
        overwrite=args.overwrite,
    )
    print(f"Pose extraction finished: {completed} extracted, {skipped} cached.")


if __name__ == "__main__":
    main()
