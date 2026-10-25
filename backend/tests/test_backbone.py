from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

import torch

from asl_backbone.catalog import SignCatalog
from asl_backbone.data import normalize_gloss, read_split
from asl_backbone.model import TemporalSignClassifier


class DatasetTests(unittest.TestCase):
    def test_reads_dataset_csv_and_preserves_gloss_labels(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.csv"
            with path.open("w", encoding="utf-8", newline="") as file:
                writer = csv.writer(file)
                writer.writerow(["Participant ID", "Video file", "Gloss", "ASL-LEX Code"])
                writer.writerow(["P1", "clip.mp4", "NOT MIND", "G_01_060"])

            records = read_split(path)

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].gloss, "NOT MIND")
        self.assertEqual(records[0].video_file, "clip.mp4")

    def test_rejects_missing_required_csv_columns(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.csv"
            path.write_text("Gloss\nHELLO\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing columns"):
                read_split(path)

    def test_catalog_matches_glosses_without_spacing_or_punctuation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.csv"
            path.write_text(
                "Participant ID,Video file,Gloss,ASL-LEX Code\nP1,clip.mp4,NOT MIND,G_01_060\n",
                encoding="utf-8",
            )
            catalog = SignCatalog.from_csv(path)
        self.assertEqual(catalog.lookup("not-mind")[0].gloss, "NOT MIND")
        self.assertEqual(catalog.search("mind"), ["NOT MIND"])
        self.assertEqual(catalog.find_video("clip.mp4").gloss, "NOT MIND")

    def test_gloss_normalization(self) -> None:
        self.assertEqual(normalize_gloss("Not Mind!"), "NOTMIND")


class ModelTests(unittest.TestCase):
    def test_model_returns_one_logit_per_gloss(self) -> None:
        model = TemporalSignClassifier(class_count=7)
        output = model(torch.randn(2, 4, 3, 32, 32))
        self.assertEqual(tuple(output.shape), (2, 7))

    def test_model_rejects_invalid_input_shape(self) -> None:
        model = TemporalSignClassifier(class_count=2)
        with self.assertRaisesRegex(ValueError, "Expected input shaped"):
            model(torch.randn(2, 3, 32, 32))


if __name__ == "__main__":
    unittest.main()
