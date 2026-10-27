from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from asl_backbone import api
from asl_backbone.catalog import SignCatalog, ZetarisCatalog, read_pose_tracks
from asl_backbone.data import VideoRecord
from asl_backbone.providers import (
    GlossDraft,
    ProviderError,
    ProviderSettings,
    draft_glosses,
)


class _Response:
    def __init__(self, payload: object) -> None:
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return self.payload


class ProviderTests(unittest.TestCase):
    def test_meterless_uses_openai_compatible_chat_completions_with_server_token(self) -> None:
        completion = {"choices": [{"message": {"content": '{"glosses":["hello"]}'}}]}
        with (
            patch.dict(
                os.environ,
                {
                    "LLM_PROVIDER": "meterless",
                    "METERLESS_API_TOKEN": "private-token",
                    "METERLESS_MODEL": "nightshift-test",
                },
                clear=True,
            ),
            patch("asl_backbone.providers.urlopen", return_value=_Response(completion)) as urlopen,
        ):
            draft = draft_glosses("hello")

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:8088/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer private-token")
        self.assertEqual(draft.glosses, ["HELLO"])

    def test_rejects_malformed_gloss_json(self) -> None:
        completion = {"choices": [{"message": {"content": '{"glosses":["HELLO"],"extra":true}'}}]}
        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "groq", "GROQ_API_KEY": "secret"}),
            patch("asl_backbone.providers.urlopen", return_value=_Response(completion)),
        ):
            with self.assertRaises(ProviderError):
                draft_glosses("hello")

    def test_status_reports_configuration_without_returning_secrets(self) -> None:
        with patch.dict(
            os.environ,
            {
                "LLM_PROVIDER": "meterless",
                "METERLESS_API_TOKEN": "must-not-leak",
                "GROQ_API_KEY": "also-private",
                "ZETARIS_BASE_URL": "https://catalog.example",
                "ZETARIS_API_TOKEN": "catalog-secret",
            },
            clear=True,
        ):
            status = api.provider_status()

        serialized = json.dumps(status)
        self.assertEqual(status["active_gloss_provider"], "meterless")
        self.assertTrue(status["providers"]["groq"]["configured"])
        self.assertTrue(status["providers"]["meterless"]["configured"])
        self.assertTrue(status["zetaris"]["configured"])
        self.assertNotIn("must-not-leak", serialized)
        self.assertNotIn("also-private", serialized)
        self.assertNotIn("catalog-secret", serialized)

    def test_groq_provider_settings_use_configured_token(self) -> None:
        with patch.dict(
            os.environ,
            {"LLM_PROVIDER": "groq", "GROQ_API_KEY": "groq-secret", "GROQ_MODEL": "gemma-2b"},
            clear=True,
        ):
            settings = ProviderSettings.from_env()
        self.assertEqual(settings.provider, "groq")
        self.assertEqual(settings.base_url, "https://api.groq.com/openai/v1")
        self.assertEqual(settings.token, "groq-secret")
        self.assertEqual(settings.model, "gemma-2b")

    def test_default_provider_is_groq(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = ProviderSettings.from_env()
        self.assertEqual(settings.provider, "groq")
        self.assertEqual(settings.base_url, "https://api.groq.com/openai/v1")

    def test_invalid_provider_raises_value_error(self) -> None:
        with patch.dict(os.environ, {"LLM_PROVIDER": "openai"}, clear=True):
            with self.assertRaises(ValueError):
                ProviderSettings.from_env()

    def test_meterless_settings_use_custom_base_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                "LLM_PROVIDER": "meterless",
                "METERLESS_BASE_URL": "http://127.0.0.1:9999/v1",
                "METERLESS_API_TOKEN": "tok",
                "METERLESS_MODEL": "nightshift-xl",
            },
            clear=True,
        ):
            settings = ProviderSettings.from_env()
        self.assertEqual(settings.provider, "meterless")
        self.assertEqual(settings.base_url, "http://127.0.0.1:9999/v1")
        self.assertEqual(settings.model, "nightshift-xl")

    def test_provider_status_without_zetaris_reports_unconfigured(self) -> None:
        with patch.dict(
            os.environ,
            {"LLM_PROVIDER": "groq", "GROQ_API_KEY": "secret"},
            clear=True,
        ):
            status = api.provider_status()
        self.assertEqual(status["active_gloss_provider"], "groq")
        self.assertTrue(status["providers"]["groq"]["configured"])
        self.assertFalse(status["providers"]["meterless"]["configured"])
        self.assertFalse(status["zetaris"]["configured"])
        self.assertIsNone(status["zetaris"]["available"])

    def test_provider_status_with_invalid_provider(self) -> None:
        with patch.dict(os.environ, {"LLM_PROVIDER": "unknown"}, clear=True):
            status = api.provider_status()
        self.assertEqual(status["active_gloss_provider"], "invalid_configuration")


class ZetarisCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.local = SignCatalog(
            [VideoRecord("P1", "hello.mp4", "HELLO", "G_001")]
        )

    def test_uses_zetaris_records_when_available(self) -> None:
        response = _Response(
            {
                "records": [
                    {
                        "participant_id": "P2",
                        "video_id": "remote-video",
                        "gloss": "HELLO",
                        "asl_lex_code": "G_002",
                    }
                ]
            }
        )
        catalog = ZetarisCatalog(self.local, "http://zetaris.test")
        with patch("asl_backbone.catalog.urlopen", return_value=response):
            records = catalog.lookup("HELLO")
        self.assertEqual(records[0].video_file, "remote-video")
        self.assertTrue(catalog.available)

    def test_falls_back_to_local_catalog_when_zetaris_is_unavailable(self) -> None:
        catalog = ZetarisCatalog(self.local, "http://zetaris.test")
        with patch("asl_backbone.catalog.urlopen", side_effect=OSError("offline")):
            records = catalog.lookup("HELLO")
        self.assertEqual(records[0].video_file, "hello.mp4")
        self.assertFalse(catalog.available)

    def test_reads_pose_tracks_from_local_json_index(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            index_path = Path(directory) / "index.json"
            index_path.write_text(
                json.dumps(
                    {
                        "tracks": [
                            {
                                "video_id": "hello.mp4",
                                "track_id": "pose-1",
                                "path": "pose-1.json",
                                "format": "mediapipe",
                            },
                            {"video_id": "other.mp4", "track_id": "pose-2"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            (Path(directory) / "pose-1.json").write_text("{}", encoding="utf-8")
            tracks = read_pose_tracks(index_path, "hello.mp4")
        self.assertEqual(
            tracks,
            [{"track_id": "pose-1", "available": True, "format": "mediapipe"}],
        )


class GlossDraftIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_catalog = api.runtime.catalog
        api.runtime.catalog = SignCatalog(
            [VideoRecord("P1", "hello.mp4", "HELLO", "G_001")]
        )

    def tearDown(self) -> None:
        api.runtime.catalog = self.original_catalog

    def test_uses_validated_provider_draft_and_marks_it_unreviewed(self) -> None:
        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "meterless"}, clear=True),
            patch.object(api, "draft_glosses", return_value=GlossDraft(glosses=["hello"])),
        ):
            sequence, provider = api._reference_sequence("hello")
        self.assertEqual(provider, "meterless")
        self.assertEqual(sequence[0]["gloss"], "HELLO")

    def test_falls_back_to_exact_lookup_for_provider_failure_or_unknown_gloss(self) -> None:
        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "meterless"}, clear=True),
            patch.object(api, "draft_glosses", return_value=GlossDraft(glosses=["UNKNOWN"])),
        ):
            sequence, provider = api._reference_sequence("HELLO")
        self.assertIsNone(provider)
        self.assertEqual(sequence[0]["gloss"], "HELLO")

        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "meterless"}, clear=True),
            patch.object(api, "draft_glosses", side_effect=ProviderError("offline")),
        ):
            sequence, provider = api._reference_sequence("HELLO")
        self.assertIsNone(provider)
        self.assertEqual(sequence[0]["video_id"], "hello.mp4")


class HealthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_catalog = api.runtime.catalog
        self.original_model = api.runtime.model
        self.original_model_version = api.runtime.model_version
        api.runtime.model = None
        api.runtime.model_version = "test-v1"
        api.runtime.catalog = SignCatalog(
            [VideoRecord("P1", "hello.mp4", "HELLO", "G_001")]
        )

    def tearDown(self) -> None:
        api.runtime.catalog = self.original_catalog
        api.runtime.model = self.original_model
        api.runtime.model_version = self.original_model_version

    def test_health_includes_provider_and_zetaris_status(self) -> None:
        with patch.dict(
            os.environ,
            {
                "LLM_PROVIDER": "meterless",
                "METERLESS_API_TOKEN": "private-token",
                "ZETARIS_BASE_URL": "https://catalog.example",
                "ZETARIS_API_TOKEN": "catalog-secret",
            },
            clear=True,
        ):
            health = api.health()
        serialized = json.dumps(health)
        self.assertEqual(health["active_gloss_provider"], "meterless")
        self.assertTrue(health["providers"]["meterless"]["configured"])
        self.assertTrue(health["zetaris"]["configured"])
        self.assertNotIn("private-token", serialized)
        self.assertNotIn("catalog-secret", serialized)

    def test_health_reports_model_not_loaded_when_no_checkpoint(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            health = api.health()
        self.assertEqual(health["status"], "model_not_loaded")
        self.assertFalse(health["recognizer_loaded"])
        self.assertTrue(health["reference_catalog_loaded"])


class SignPlanEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_catalog = api.runtime.catalog
        api.runtime.catalog = SignCatalog(
            [VideoRecord("P1", "hello.mp4", "HELLO", "G_001")]
        )

    def tearDown(self) -> None:
        api.runtime.catalog = self.original_catalog

    def test_sign_plan_returns_unreviewed_draft_with_valid_provider_draft(self) -> None:
        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "meterless"}, clear=True),
            patch.object(
                api, "draft_glosses", return_value=GlossDraft(glosses=["hello"])
            ),
        ):
            result = api.create_reference_plan(api.PlanRequest(text="hello"))
        self.assertTrue(result["supported"])
        self.assertEqual(result["status"], "unreviewed_draft")
        self.assertEqual(result["gloss_provider"], "meterless")
        self.assertEqual(result["draft_status"], "unreviewed")

    def test_sign_plan_falls_back_to_local_lookup_on_provider_failure(self) -> None:
        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "meterless"}, clear=True),
            patch.object(api, "draft_glosses", side_effect=ProviderError("offline")),
        ):
            result = api.create_reference_plan(api.PlanRequest(text="HELLO"))
        self.assertTrue(result["supported"])
        self.assertEqual(result["status"], "reference_only")
        self.assertEqual(result["gloss_provider"], "local_exact_lookup")
        self.assertEqual(result["draft_status"], "not_created")

    def test_sign_plan_returns_unsupported_when_no_match(self) -> None:
        with (
            patch.dict(os.environ, {"LLM_PROVIDER": "meterless"}, clear=True),
            patch.object(
                api, "draft_glosses", return_value=GlossDraft(glosses=["UNKNOWN"])
            ),
        ):
            result = api.create_reference_plan(api.PlanRequest(text="goodbye"))
        self.assertFalse(result["supported"])
        self.assertEqual(result["status"], "unsupported")


class PoseTracksEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_catalog = api.runtime.catalog
        self.original_pose_path = api.runtime.pose_tracks_path

    def tearDown(self) -> None:
        api.runtime.catalog = self.original_catalog
        api.runtime.pose_tracks_path = self.original_pose_path

    def test_pose_tracks_falls_back_to_local_json_when_catalog_unavailable(self) -> None:
        api.runtime.catalog = None
        api.runtime.pose_tracks_path = None
        result = api.list_video_pose_tracks("hello.mp4")
        self.assertEqual(result["source"], "local")
        self.assertEqual(result["pose_tracks"], [])

    def test_pose_tracks_reports_local_when_zetaris_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            index_path = Path(directory) / "index.json"
            index_path.write_text(
                json.dumps(
                    {
                        "tracks": [
                            {
                                "video_id": "hello.mp4",
                                "track_id": "pose-1",
                                "path": "pose-1.json",
                                "format": "json",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            (Path(directory) / "pose-1.json").write_text("{}", encoding="utf-8")
            api.runtime.pose_tracks_path = index_path
            catalog = ZetarisCatalog(
                SignCatalog([VideoRecord("P1", "hello.mp4", "HELLO", "G_001")]),
                "",
                pose_tracks_path=index_path,
            )
            api.runtime.catalog = catalog
            with patch("asl_backbone.catalog.urlopen", side_effect=OSError("offline")):
                result = api.list_video_pose_tracks("hello.mp4")
        self.assertEqual(result["source"], "local")
        self.assertEqual(len(result["pose_tracks"]), 1)
        self.assertEqual(result["pose_tracks"][0]["track_id"], "pose-1")

    def test_pose_tracks_reports_zetaris_when_available(self) -> None:
        catalog = ZetarisCatalog(
            SignCatalog([VideoRecord("P1", "hello.mp4", "HELLO", "G_001")]),
            "http://zetaris.test",
        )
        api.runtime.catalog = catalog
        response = _Response(
            {
                "pose_tracks": [
                    {"track_id": "pose-1", "available": True, "format": "mediapipe"}
                ]
            }
        )
        with patch("asl_backbone.catalog.urlopen", return_value=response):
            result = api.list_video_pose_tracks("hello.mp4")
        self.assertEqual(result["source"], "zetaris")


if __name__ == "__main__":
    unittest.main()
