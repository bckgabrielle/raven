from __future__ import annotations

from pathlib import Path

from .alphabet_dataset import load_alphabet_samples


DATASET_HANDLE = "chaitanyakakade77/american-sign-language-dataset"


def main() -> None:
    try:
        import kagglehub
    except ImportError as error:
        raise SystemExit(
            "KaggleHub is optional. Install it with `python -m pip install kagglehub` "
            "to download the ASL alphabet image dataset."
        ) from error

    download_path = Path(kagglehub.dataset_download(DATASET_HANDLE)).expanduser().resolve()
    samples = load_alphabet_samples(download_path)
    sample_count = sum(len(letter_samples) for letter_samples in samples.values())
    print(f"Dataset downloaded to: {download_path}")
    print(f"Found {len(samples)} letter folders and {sample_count} image samples.")
    print(
        "Set ASL_ALPHABET_DATASET_ROOT in the backend terminal to the dataset path above, "
        "then restart the backend."
    )


if __name__ == "__main__":
    main()
