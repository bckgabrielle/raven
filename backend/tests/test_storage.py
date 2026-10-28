from __future__ import annotations

import sqlite3
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

    def test_pose_job_queue_recovers_and_rejects_a_second_active_job(self) -> None:
        job = self.store.enqueue_pose_job("asset-1")
        self.assertEqual(job["status"], "queued")
        with self.assertRaises(ValueError):
            self.store.enqueue_pose_job("asset-1")

        claimed = self.store.claim_next_pose_job()
        self.assertEqual(claimed["id"], job["id"])
        self.assertEqual(claimed["status"], "processing")
        self.assertEqual(self.store.recover_interrupted_pose_jobs(), 1)
        self.assertEqual(self.store.get_pose_job(job["id"])["status"], "queued")

        self.store.claim_next_pose_job()
        self.store.finish_pose_job(job["id"], "succeeded", pose_path="track.json")
        finished = self.store.get_pose_job(job["id"])
        self.assertEqual(finished["status"], "succeeded")
        self.assertEqual(finished["pose_path"], "track.json")
        self.store.enqueue_pose_job("asset-1")

    def test_retention_removes_old_requests_and_source_files_without_changing_manifests(self) -> None:
        processing = self.store.create_request("BUSY", "BUSY")
        claimed = self.store.claim_next_request()
        self.assertEqual(claimed["id"], processing["id"])
        recent = self.store.create_request("HELLO", "HELLO")
        old = self.store.create_request("OLD", "OLD")
        connection = sqlite3.connect(self.store.database_path)
        try:
            connection.execute(
                "UPDATE signing_requests SET created_at = ? WHERE id = ?",
                ("2020-01-01T00:00:00+00:00", old["id"]),
            )
            connection.execute(
                "UPDATE signing_requests SET created_at = ? WHERE id = ?",
                ("2020-01-01T00:00:00+00:00", processing["id"]),
            )
            connection.commit()
        finally:
            connection.close()

        raw_root = Path(self.directory.name) / "raw-videos"
        raw_root.mkdir()
        video_path = raw_root / "approved.mp4"
        video_path.write_bytes(b"video-bytes")
        self.store.save_dataset_asset(
            {
                "id": "approved",
                "participant_id": "P-1",
                "filename": "approved.mp4",
                "storage_path": str(video_path),
                "sha256": "b" * 64,
                "gloss": "HELLO",
                "license_name": "Example license",
                "license_url": "https://example.test/license",
                "consent_confirmed": True,
                "review_status": "approved",
                "created_at": "2020-01-01T00:00:00+00:00",
            }
        )
        version = self.store.create_dataset_version()
        manifest_before = self.store.get_dataset_version(version["id"])

        removed = self.store.expire_requests("2021-01-01T00:00:00+00:00")
        purged = self.store.expire_source_videos("2021-01-01T00:00:00+00:00", raw_root)

        self.assertEqual(removed, 1)
        self.assertIsNone(self.store.get_request(old["id"]))
        self.assertIsNotNone(self.store.get_request(recent["id"]))
        self.assertEqual(self.store.get_request(processing["id"])["status"], "processing")
        self.assertEqual(purged, 1)
        self.assertFalse(video_path.exists())
        self.assertIsNotNone(self.store.get_dataset_asset("approved")["source_deleted_at"])
        self.assertEqual(self.store.get_dataset_version(version["id"]), manifest_before)

    def test_retention_keeps_source_video_while_pose_extraction_is_active(self) -> None:
        raw_root = Path(self.directory.name) / "raw-videos"
        raw_root.mkdir()
        video_path = raw_root / "clip.mp4"
        video_path.write_bytes(b"video-bytes")
        self.store.save_dataset_asset(
            {
                "id": "clip",
                "participant_id": "P-1",
                "filename": "clip.mp4",
                "storage_path": str(video_path),
                "sha256": "c" * 64,
                "gloss": "HELLO",
                "license_name": "Example license",
                "license_url": "https://example.test/license",
                "consent_confirmed": True,
                "review_status": "approved",
                "created_at": "2020-01-01T00:00:00+00:00",
            }
        )
        self.store.enqueue_pose_job("clip")
        purged = self.store.expire_source_videos("2021-01-01T00:00:00+00:00", raw_root)
        self.assertEqual(purged, 0)
        self.assertTrue(video_path.exists())
        self.assertIsNone(self.store.get_dataset_asset("clip")["source_deleted_at"])

    def test_training_run_records_completion(self) -> None:
        run_id = self.store.create_training_run(
            dataset_version_id="dataset-abc",
            manifest_sha256="d" * 64,
            output_path="artifacts/model.pt",
        )
        self.assertEqual(self.store.get_training_run(run_id)["status"], "running")
        self.store.finish_training_run(run_id, "completed", checkpoint_sha256="e" * 64)
        finished = self.store.get_training_run(run_id)
        self.assertEqual(finished["status"], "completed")
        self.assertEqual(finished["checkpoint_sha256"], "e" * 64)
        self.assertEqual(finished["dataset_version_id"], "dataset-abc")


if __name__ == "__main__":
    unittest.main()
