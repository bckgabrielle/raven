from __future__ import annotations

import re
from pathlib import Path


_CLASS_DIRECTORY = re.compile(r"([A-Z])(?:-SAMPLES)?", re.IGNORECASE)
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def load_alphabet_samples(dataset_root: Path) -> dict[str, list[Path]]:
    root = dataset_root / "ASL_Data" if (dataset_root / "ASL_Data").is_dir() else dataset_root
    if not root.is_dir():
        raise FileNotFoundError(f"ASL alphabet dataset directory not found: {dataset_root}")

    resolved_root = root.resolve()
    samples_by_letter: dict[str, list[Path]] = {}
    for class_directory in root.iterdir():
        if not class_directory.is_dir():
            continue
        resolved_directory = class_directory.resolve()
        if resolved_directory.parent != resolved_root:
            continue
        match = _CLASS_DIRECTORY.fullmatch(class_directory.name)
        if match is None:
            continue

        letter = match.group(1).upper()
        sample_paths = [
            path
            for path in class_directory.iterdir()
            if path.is_file()
            and path.suffix.lower() in _IMAGE_EXTENSIONS
            and path.resolve().parent == resolved_directory
        ]
        sample_paths.sort(
            key=lambda path: [
                int(part) if part.isdigit() else part.casefold()
                for part in re.split(r"(\d+)", path.name)
            ]
        )
        if sample_paths:
            samples_by_letter[letter] = sample_paths

    if not samples_by_letter:
        raise ValueError(
            f"No A-Z image sample folders were found in the ASL alphabet dataset: {root}"
        )
    return samples_by_letter
