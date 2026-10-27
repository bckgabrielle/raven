from __future__ import annotations

import asyncio
import io
import os
import tempfile
import time
import unittest
from pathlib import Path

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from asl_backbone import api
from asl_backbone.catalog import SignCatalog
from asl_backbone.data import VideoRecord
from asl_backbone.storage import Store


class SigningApiServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.original_store = api.runtime.store
        self.original_state_root = api.runtime.state_root
        self.original_catalog = api.runtime.catalog
        self.original_model_version = api.runtime.model_version
        api.runtime.state_root = Path(self.directory.name)
        api.runtime.store = Store(Path(self.directory.name) / "state.sqlite3")
        api.runtime.catalog = SignCatalog(
            [VideoRecord("participant", "hello.mp4", "HELLO", "G_001")]
        )
        api.runtime.model_version = "test-model-v1"

    def tearDown(self) -> None:
        api.runtime.store = self.original_store
        api.runtime.state_root = self.original_state_root
        api.runtime.catalog = self.original_catalog
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


if __name__ == "__main__":
    unittest.main()
