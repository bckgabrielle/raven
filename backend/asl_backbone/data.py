from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset


@dataclass(frozen=True)
class VideoRecord:
    participant_id: str
    video_file: str
    gloss: str
    asl_lex_code: str


def read_split(csv_path: Path) -> list[VideoRecord]:
    if not csv_path.is_file():
        raise FileNotFoundError(f"Split CSV not found: {csv_path}")

    records: list[VideoRecord] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required = {"Participant ID", "Video file", "Gloss", "ASL-LEX Code"}
        missing = required.difference(reader.fieldnames or ())
        if missing:
            raise ValueError(f"{csv_path} is missing columns: {', '.join(sorted(missing))}")

        for line_number, row in enumerate(reader, start=2):
            values = [row.get(column, "").strip() for column in sorted(required)]
            if any(not value for value in values):
                raise ValueError(f"{csv_path}:{line_number} contains an empty required value")
            records.append(
                VideoRecord(
                    participant_id=row["Participant ID"].strip(),
                    video_file=row["Video file"].strip(),
                    gloss=row["Gloss"].strip(),
                    asl_lex_code=row["ASL-LEX Code"].strip(),
                )
            )

    if not records:
        raise ValueError(f"Split CSV contains no records: {csv_path}")
    return records


def normalize_gloss(gloss: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", gloss.upper())


def sample_video(path: Path, frame_count: int, image_size: int) -> torch.Tensor:
    if frame_count < 1 or image_size < 1:
        raise ValueError("frame_count and image_size must be positive")
    if not path.is_file():
        raise FileNotFoundError(f"Video file not found: {path}")

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        raise ValueError(f"Could not open video: {path}")

    try:
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            raise ValueError(f"Video has no readable frames: {path}")

        indexes = np.linspace(0, total_frames - 1, frame_count).round().astype(int)
        frames: list[np.ndarray] = []
        for index in indexes:
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
            success, frame = capture.read()
            if not success or frame is None:
                raise ValueError(f"Could not decode frame {index} from {path}")
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = cv2.resize(frame, (image_size, image_size), interpolation=cv2.INTER_AREA)
            frames.append(frame)
    finally:
        capture.release()

    array = np.stack(frames).astype(np.float32) / 127.5 - 1.0
    return torch.from_numpy(array.transpose(0, 3, 1, 2).copy())


class SignVideoDataset(Dataset[tuple[torch.Tensor, int]]):
    def __init__(
        self,
        records: Sequence[VideoRecord],
        video_dir: Path,
        label_to_id: dict[str, int],
        frame_count: int = 16,
        image_size: int = 112,
    ) -> None:
        unknown = sorted({record.gloss for record in records}.difference(label_to_id))
        if unknown:
            raise ValueError(f"Gloss labels are absent from the training vocabulary: {unknown[:5]}")
        self.records = list(records)
        self.video_dir = video_dir
        self.label_to_id = label_to_id
        self.frame_count = frame_count
        self.image_size = image_size

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        record = self.records[index]
        video_path = self.video_dir / record.video_file
        frames = sample_video(video_path, self.frame_count, self.image_size)
        return frames, self.label_to_id[record.gloss]
