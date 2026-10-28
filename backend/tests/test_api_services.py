from __future__ import annotations

import asyncio
import io
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from asl_backbone import api
from asl_backbone.catalog import SignCatalog
from asl_backbone.data import VideoRecord
from asl_backbone.pose_tracks import load_pose_track, pose_track_path
from asl_backbone.storage import Store


class SigningApiServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.original_store = api.runtime.store
        self.original_state_root = api.runtime.state_root
        self.original_catalog = api.runtime.catalog
        self.original_dataset_root = api.runtime.dataset_root
        self.original_model_version = api.runtime.model_version
        api.runtime.state_root = Path(self.directory.name)
        api.runtime.store = Store(Path(self.directory.name) / "state.sqlite3")
        api.runtime.catalog = SignCatalog(
            [VideoRecord("participant", "hello.mp4", "HELLO", "G_001")]
        )
        api.runtime.dataset_root = None
        api.runtime.model_version = "test-model-v1"

    def tearDown(self) -> None:
        api.runtime.store = self.original_store
        api.runtime.state_root = self.original_state_root
        api.runtime.catalog = self.original_catalog
        api.runtime.dataset_root = self.original_dataset_root
        api.runtime.model_version = self.original_model_version
        self.directory.cleanup()

    def test_request_returns_persisted_reference_result_and_feedback(self) -> None:
        accepted = api.create_signing_request(api.PlanRequest(text="  HELLO  "))
        self.assertEqual(accepted["status"], "queued")
        api._process_signing_request(accepted["request_id"])

        request = api.get_signing_request(accepted["request_id"])
        self.assertEqual(request["status"], "reference_only")
        result = api.get_signing_result(request["result_id"])
        self.assertEqual(result["model_version"], "test-model-v1")
        self.assertIsNone(result["motion_data"])
        self.assertTrue(result["supported"])

        feedback = api.submit_result_feedback(
            request["result_id"],
            api.FeedbackRequest(category="unclear", message="Needs review"),
        )
        self.assertEqual(feedback["status"], "received")

    def test_nonmatching_text_is_explicitly_unsupported(self) -> None:
        accepted = api.create_signing_request(api.PlanRequest(text="Hello world"))
        api._process_signing_request(accepted["request_id"])

        request = api.get_signing_request(accepted["request_id"])
        result = api.get_signing_result(request["result_id"])
        self.assertEqual(result["status"], "unsupported")
        self.assertFalse(result["supported"])

    def test_sqlite_worker_processes_queued_request(self) -> None:
        accepted = api.create_signing_request(api.PlanRequest(text="HELLO"))
        api.runtime.start_worker()
        try:
            deadline = time.monotonic() + 3
            request = api.get_signing_request(accepted["request_id"])
            while request["status"] in {"queued", "processing"} and time.monotonic() < deadline:
                time.sleep(0.02)
                request = api.get_signing_request(accepted["request_id"])
            self.assertEqual(request["status"], "reference_only")
        finally:
            api.runtime.stop_worker()

    def test_admin_routes_require_configured_token(self) -> None:
        previous = os.environ.pop("ASL_ADMIN_TOKEN", None)
        try:
            with self.assertRaises(HTTPException) as error:
                api.require_admin("anything")
            self.assertEqual(error.exception.status_code, 503)
        finally:
            if previous is not None:
                os.environ["ASL_ADMIN_TOKEN"] = previous

    def test_dataset_upload_records_consent_license_hash_and_pending_review(self) -> None:
        upload = UploadFile(filename="signer-clip.mp4", file=io.BytesIO(b"video-bytes"))
        response = asyncio.run(
            api.upload_dataset_asset(
                video=upload,
                participant_id="P-1",
                gloss="HELLO",
                license_name="Approved sample license",
                license_url="https://example.test/license",
                consent_confirmed=True,
            )
        )
        self.assertEqual(response["review_status"], "pending")
        asset = api.runtime.store.list_dataset_assets()[0]
        self.assertEqual(asset["license_name"], "Approved sample license")
        self.assertEqual(asset["consent_confirmed"], 1)
        self.assertEqual(asset["review_status"], "pending")

    def test_signing_result_includes_isolated_pose_track_when_one_exists(self) -> None:
        root = Path(self.directory.name) / "dataset"
        api.runtime.dataset_root = root
        track_path = pose_track_path(root, "hello.mp4")
        track_path.parent.mkdir(parents=True)
        track_path.write_text(
            json.dumps(
                {
                    "gloss": "HELLO",
                    "video_id": "hello.mp4",
                    "fps": 15,
                    "frames": [_playable_frame()],
                }
            ),
            encoding="utf-8",
        )

        accepted = api.create_signing_request(api.PlanRequest(text="HELLO"))
        api._process_signing_request(accepted["request_id"])
        result = api.get_signing_result(api.get_signing_request(accepted["request_id"])["result_id"])

        self.assertEqual(result["motion_data"]["schema_version"], "isolated-pose-v1")
        self.assertFalse(result["motion_data"]["sentence_motion"])
        self.assertTrue(result["motion_data"]["isolated_sign"])
        self.assertEqual(result["motion_data"]["tracks"][0]["video_id"], "hello.mp4")
        self.assertEqual(result["motion_data"]["tracks"][0]["frame_count"], 1)
        self.assertTrue(result["motion_data_version"].startswith("isolated-pose-v1:"))
        self.assertIn("isolated-sign pose track", result["warning"])

    def test_text_file_upload_is_queued_and_validated(self) -> None:
        upload = UploadFile(filename="phrase.txt", file=io.BytesIO("  HELLO  ".encode("utf-8")))
        accepted = asyncio.run(api.create_signing_request_from_file(upload))
        self.assertEqual(accepted["status"], "queued")
        api._process_signing_request(accepted["request_id"])
        self.assertEqual(api.get_signing_request(accepted["request_id"])["status"], "reference_only")

        rejected = UploadFile(filename="notes.md", file=io.BytesIO(b"HELLO"))
        with self.assertRaises(HTTPException) as wrong_type:
            asyncio.run(api.create_signing_request_from_file(rejected))
        self.assertEqual(wrong_type.exception.status_code, 415)

        encoded = UploadFile(filename="phrase.txt", file=io.BytesIO("HELLO".encode("utf-16")))
        with self.assertRaises(HTTPException) as wrong_encoding:
            asyncio.run(api.create_signing_request_from_file(encoded))
        self.assertEqual(wrong_encoding.exception.status_code, 422)

        too_long = UploadFile(filename="phrase.txt", file=io.BytesIO(b"A" * 1001))
        with self.assertRaises(HTTPException) as too_long_error:
            asyncio.run(api.create_signing_request_from_file(too_long))
        self.assertEqual(too_long_error.exception.status_code, 422)

    def test_pose_extraction_job_requires_approval_and_records_review_outcome(self) -> None:
        previous = os.environ.get("ASL_ADMIN_TOKEN")
        os.environ["ASL_ADMIN_TOKEN"] = "admin-secret"
        try:
            upload = UploadFile(filename="signer-clip.mp4", file=io.BytesIO(b"video-bytes"))
            created = asyncio.run(
                api.upload_dataset_asset(
                    video=upload,
                    participant_id="P-1",
                    gloss="HELLO",
                    license_name="Approved sample license",
                    license_url="https://example.test/license",
                    consent_confirmed=True,
                )
            )
            with self.assertRaises(HTTPException) as pending:
                api.create_pose_job(api.PoseJobRequest(asset_id=created["asset_id"]))
            self.assertEqual(pending.exception.status_code, 409)

            api.review_dataset_asset(created["asset_id"], api.AssetReviewRequest(review_status="approved"))
            queued = api.create_pose_job(api.PoseJobRequest(asset_id=created["asset_id"]))
            self.assertEqual(queued["status"], "queued")

            with patch.object(
                api,
                "extract_video_pose",
                side_effect=ValueError("Could not detect usable body and hand landmarks in video: clip.mp4"),
            ):
                claimed = api.runtime.store.claim_next_pose_job()
                api._process_pose_job(claimed["id"])
            reviewed = api.get_pose_job(queued["job_id"])
            self.assertEqual(reviewed["status"], "needs_review")
            self.assertIn("usable body and hand landmarks", reviewed["error"])

            retried = api.create_pose_job(api.PoseJobRequest(asset_id=created["asset_id"]))
            with patch.object(
                api,
                "extract_video_pose",
                return_value={"gloss": "HELLO", "fps": 15, "frames": [_playable_frame()]},
            ):
                claimed = api.runtime.store.claim_next_pose_job()
                api._process_pose_job(claimed["id"])
            succeeded = api.get_pose_job(retried["job_id"])
            self.assertEqual(succeeded["status"], "succeeded")
            self.assertTrue(succeeded["pose_ready"])
            stored = api.runtime.store.get_pose_job(retried["job_id"])
            self.assertIsNotNone(load_pose_track(Path(stored["pose_path"])))
        finally:
            if previous is None:
                os.environ.pop("ASL_ADMIN_TOKEN", None)
            else:
                os.environ["ASL_ADMIN_TOKEN"] = previous


def _playable_frame() -> dict[str, list[list[float] | None]]:
    body: list[list[float] | None] = [None] * 33
    hand: list[list[float] | None] = [None] * 21
    body[11] = [0.4, 0.3, 0.0]
    body[12] = [0.6, 0.3, 0.0]
    for index in (0, 5, 9, 17):
        hand[index] = [0.5, 0.5, 0.0]
    return {"body": body, "left_hand": hand, "right_hand": []}


if __name__ == "__main__":
    unittest.main()
