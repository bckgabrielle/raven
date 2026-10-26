from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from asl_backbone.storage import Store


class StoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.directory.name) / "state.sqlite3")

    def tearDown(self) -> None:
        self.directory.cleanup()

    def test_request_queue_recovers_after_interruption_and_persists_result(self) -> None:
        request = self.store.create_request(" Hello  there ", "Hello there")
        self.assertEqual(request["status"], "queued")

        claimed = self.store.claim_next_request()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["id"], request["id"])
        self.assertEqual(claimed["status"], "processing")
        self.assertEqual(self.store.recover_interrupted_requests(), 1)
        self.assertEqual(self.store.get_request(request["id"])["status"], "queued")

        self.store.claim_next_request()
        result_id = self.store.save_result(
            request["id"],
            {"request_id": request["id"], "status": "unsupported", "supported": False},
        )
        self.assertEqual(self.store.get_request(request["id"])["status"], "unsupported")
        self.assertEqual(
            self.store.get_result(result_id)["request_id"],
            request["id"],
        )
        self.store.save_feedback(result_id, "unclear", "Review")
        self.assertTrue(self.store.delete_request(request["id"]))
        self.assertIsNone(self.store.get_request(request["id"]))
        self.assertIsNone(self.store.get_result(result_id))

    def test_dataset_versions_only_include_consent_and_approved_assets(self) -> None:
        common = {
            "participant_id": "P-1",
            "filename": "asset.mp4",
            "storage_path": str(Path(self.directory.name) / "asset.mp4"),
            "sha256": "a" * 64,
            "gloss": "HELLO",
            "license_name": "Example license",
            "license_url": "https://example.test/license",
            "consent_confirmed": True,
            "review_status": "pending",
            "created_at": "2026-01-01T00:00:00+00:00",
        }
        self.store.save_dataset_asset({"id": "pending", **common})
        self.store.save_dataset_asset(
            {
                **common,
                "id": "approved",
                "filename": "approved.mp4",
            }
        )
        self.assertIsNone(self.store.create_dataset_version())

        self.store.update_asset_review("pending", "rejected")
        self.store.update_asset_review("approved", "approved")
        version = self.store.create_dataset_version()
        self.assertEqual(
            [asset["id"] for asset in version["manifest"]["assets"]],
            ["approved"],
        )
        self.assertEqual(
            self.store.get_dataset_version(version["id"])["manifest"],
            version["manifest"],
        )
        self.assertNotIn("storage_path", self.store.list_dataset_assets()[0])


if __name__ == "__main__":
    unittest.main()
