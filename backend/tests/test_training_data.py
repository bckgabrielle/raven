from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from asl_backbone.storage import Store
from asl_backbone.training_data import bind_training_videos


class TrainingDataTests(unittest.TestCase):
    def test_binding_requires_manifest_hashes_for_every_training_video(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = Store(root / "state.sqlite3")
            video = root / "hello.mp4"
            video.write_bytes(b"approved-video")
            other = root / "other.mp4"
            other.write_bytes(b"untracked-video")
            store.save_dataset_asset(
                {
                    "id": "approved",
                    "participant_id": "P-1",
                    "filename": "hello.mp4",
                    "storage_path": str(video),
                    "sha256": hashlib.sha256(b"approved-video").hexdigest(),
                    "gloss": "HELLO",
                    "license_name": "Example license",
                    "license_url": "https://example.test/license",
                    "consent_confirmed": True,
                    "review_status": "approved",
                    "created_at": "2026-01-01T00:00:00+00:00",
                }
            )
            version = store.create_dataset_version()

            with self.assertRaises(ValueError):
                bind_training_videos(store, "dataset-missing", [video])
            with self.assertRaises(ValueError):
                bind_training_videos(store, version["id"], [video, other])

            binding = bind_training_videos(store, version["id"], [video])

        self.assertEqual(binding["dataset_version_id"], version["id"])
        self.assertEqual(binding["manifest_sha256"], version["manifest_sha256"])
        self.assertEqual(binding["dataset_asset_ids"], ["approved"])


if __name__ == "__main__":
    unittest.main()
