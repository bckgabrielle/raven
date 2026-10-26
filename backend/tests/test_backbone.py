from __future__ import annotations

import csv
import asyncio
import json
import os
import tempfile
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import torch

from asl_backbone import api, groq_service
from asl_backbone.catalog import SignCatalog
from asl_backbone.data import normalize_gloss, read_split
from asl_backbone.model import TemporalSignClassifier
from asl_backbone.pose_tracks import (
    fill_short_landmark_gaps,
    load_pose_track,
    pose_track_path,
    pose_track_quality,
    _recover_missing_hands,
)


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


class PoseTrackTests(unittest.TestCase):
    @staticmethod
    def playable_frame() -> dict[str, list[list[float] | None]]:
        body: list[list[float] | None] = [None] * 33
        hand: list[list[float] | None] = [None] * 21
        body[11] = [0.4, 0.3, 0.0]
        body[12] = [0.6, 0.3, 0.0]
        for index in (0, 5, 9, 17):
            hand[index] = [0.5, 0.5, 0.0]
        return {"body": body, "left_hand": hand, "right_hand": []}

    def test_pose_track_paths_are_stable_and_do_not_use_video_path_components(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pose_track_path(root, "clip.mp4")
            self.assertEqual(first, pose_track_path(root, "clip.mp4"))
            self.assertEqual(first.parent, root / "derived" / "pose_tracks")
            self.assertNotIn("..", first.name)

    def test_pose_track_loader_rejects_invalid_and_accepts_valid_payloads(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "track.json"
            path.write_text('{"fps":0,"frames":[]}', encoding="utf-8")
            self.assertIsNone(load_pose_track(path))
            path.write_text(
                json.dumps(
                    {
                        "gloss": "APPLE",
                        "video_id": "apple.mp4",
                        "fps": 15,
                        "frames": [self.playable_frame()],
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(load_pose_track(path)["video_id"], "apple.mp4")
            path.write_text(
                json.dumps({"gloss": "APPLE", "video_id": "apple.mp4", "fps": 15, "frames": []}),
                encoding="utf-8",
            )
            self.assertIsNone(load_pose_track(path))

    def test_pose_extraction_interpolates_only_short_landmark_gaps(self) -> None:
        frames = [self.playable_frame() for _ in range(5)]
        frames[2]["left_hand"][0] = None
        frames[3]["left_hand"][0] = None
        frames[4]["left_hand"][0] = [0.8, 0.2, 0.4]
        fill_short_landmark_gaps(frames, max_gap=1)
        self.assertIsNone(frames[2]["left_hand"][0])
        self.assertIsNone(frames[3]["left_hand"][0])

        frames = [self.playable_frame() for _ in range(3)]
        frames[1]["left_hand"][0] = None
        frames[2]["left_hand"][0] = [0.8, 0.2, 0.4]
        fill_short_landmark_gaps(frames, max_gap=1)
        self.assertEqual(frames[1]["left_hand"][0], [0.65, 0.35, 0.2])

    def test_fallback_hand_detection_uses_body_wrist_proximity(self) -> None:
        body: list[list[float] | None] = [None] * 33
        body[15] = [0.2, 0.4, 0.0]
        body[16] = [0.8, 0.4, 0.0]
        detected = SimpleNamespace(
            multi_hand_landmarks=[
                SimpleNamespace(
                    landmark=[SimpleNamespace(x=0.78, y=0.42, z=0.0) for _ in range(21)]
                )
            ],
            multi_handedness=[],
        )
        left, right = _recover_missing_hands(detected, body, [], [])
        self.assertEqual(left, [])
        self.assertEqual(len(right), 21)

    def test_translation_and_pose_route_expose_only_an_extracted_local_track(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            split = root / "train.csv"
            split.write_text(
                "Participant ID,Video file,Gloss,ASL-LEX Code\n"
                "P1,apple.mp4,APPLE,A_03_054\n",
                encoding="utf-8",
            )
            catalog = SignCatalog.from_csv(split)
            track_path = pose_track_path(root, "apple.mp4")
            track_path.parent.mkdir(parents=True)
            track_path.write_text(
                json.dumps(
                    {
                        "gloss": "APPLE",
                        "video_id": "apple.mp4",
                        "fps": 15,
                        "frames": [self.playable_frame()],
                    }
                ),
                encoding="utf-8",
            )
            with patch.object(api.runtime, "catalog", catalog), patch.object(
                api.runtime, "dataset_root", root
            ), patch.object(api, "is_configured", return_value=True), patch.object(
                api, "draft_glosses", new=AsyncMock(return_value=["APPLE"])
            ):
                response = asyncio.run(
                    api.translate_text(api.TranslationRequest(text="I like apples"))
                )
                pose = api.get_pose_track("APPLE")
                plan = api.create_reference_plan(api.PlanRequest(text="APPLE"))

        self.assertEqual(response["sequence"][0]["pose_url"], "/v1/poses/APPLE")
        self.assertEqual(pose["video_id"], "apple.mp4")
        self.assertEqual(plan["sequence"][0]["pose_url"], "/v1/poses/APPLE")

    def test_pose_route_reports_missing_tracks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            split = root / "train.csv"
            split.write_text(
                "Participant ID,Video file,Gloss,ASL-LEX Code\n"
                "P1,apple.mp4,APPLE,A_03_054\n",
                encoding="utf-8",
            )
            with patch.object(api.runtime, "catalog", SignCatalog.from_csv(split)), patch.object(
                api.runtime, "dataset_root", root
            ):
                with self.assertRaises(api.HTTPException) as context:
                    api.get_pose_track("APPLE")
        self.assertEqual(context.exception.status_code, 404)

    def test_pose_route_selects_the_clip_with_better_hand_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            split = root / "train.csv"
            split.write_text(
                "Participant ID,Video file,Gloss,ASL-LEX Code\n"
                "P1,first.mp4,APPLE,A_03_054\n"
                "P2,second.mp4,APPLE,A_03_054\n",
                encoding="utf-8",
            )
            for video_id, valid_frames in (("first.mp4", 1), ("second.mp4", 3)):
                frames = [self.playable_frame() for _ in range(3)]
                for frame in frames[valid_frames:]:
                    frame["left_hand"] = []
                path = pose_track_path(root, video_id)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    json.dumps(
                        {
                            "gloss": "APPLE",
                            "video_id": video_id,
                            "fps": 15,
                            "frames": frames,
                        }
                    ),
                    encoding="utf-8",
                )
            with patch.object(api.runtime, "catalog", SignCatalog.from_csv(split)), patch.object(
                api.runtime, "dataset_root", root
            ):
                track = api.get_pose_track("APPLE")

        self.assertEqual(track["video_id"], "second.mp4")
        self.assertGreater(pose_track_quality(track)[0], 0.9)


class GroqIntegrationTests(unittest.TestCase):
    def test_reports_groq_as_unconfigured_without_a_key(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(groq_service.is_configured())

    def test_authorization_header_uses_bearer_key(self) -> None:
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=True):
            self.assertEqual(
                groq_service._headers(),
                {"Authorization": "Bearer test-key"},
            )

    def test_rejects_unstructured_gloss_generation_output(self) -> None:
        class Response:
            is_error = False

            @staticmethod
            def json():
                return {
                    "choices": [
                        {"message": {"content": '{"glosses": ["HELLO", 42]}'}}
                    ]
                }

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, *_args, **_kwargs):
                return Response()

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch.object(
            groq_service.httpx, "AsyncClient", return_value=Client()
        ):
            with self.assertRaisesRegex(groq_service.GroqServiceError, "invalid gloss labels"):
                asyncio.run(groq_service.draft_glosses("Hello"))

    def test_transcribes_audio_response(self) -> None:
        class Response:
            is_error = False

            @staticmethod
            def json():
                return {"text": "Hello from audio"}

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, **kwargs):
                self.url = url
                self.kwargs = kwargs
                return Response()

        client = Client()
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch.object(
            groq_service.httpx, "AsyncClient", return_value=client
        ):
            transcript = asyncio.run(
                groq_service.transcribe_audio(b"audio-bytes", "speech.wav", "audio/wav")
            )

        self.assertEqual(transcript, "Hello from audio")
        self.assertTrue(client.url.endswith("/audio/transcriptions"))
        self.assertEqual(client.kwargs["headers"]["Authorization"], "Bearer test-key")

    def test_groq_draft_includes_reference_and_review_status(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.csv"
            path.write_text(
                "Participant ID,Video file,Gloss,ASL-LEX Code\n"
                "P1,apple.mp4,APPLE,A_03_054\n",
                encoding="utf-8",
            )
            catalog = SignCatalog.from_csv(path)
            with patch.object(api.runtime, "catalog", catalog), patch.object(
                api.runtime, "dataset_root", Path(directory)
            ), patch.object(api, "is_configured", return_value=True), patch.object(
                api, "draft_glosses", new=AsyncMock(return_value=["APPLE", "UNKNOWN"])
            ):
                response = asyncio.run(
                    api.translate_text(api.TranslationRequest(text="I like apples"))
                )

        self.assertEqual(response["translation_source"], "groq_unreviewed")
        self.assertEqual(response["review_status"], "unreviewed")
        self.assertEqual(response["model_version"], "llama-3.3-70b-versatile")
        self.assertEqual(response["unsupported_glosses"], ["UNKNOWN"])
        self.assertEqual(response["sequence"][0]["reference"]["video_id"], "apple.mp4")

    def test_local_fallback_only_returns_exact_dataset_word_matches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.csv"
            path.write_text(
                "Participant ID,Video file,Gloss,ASL-LEX Code\n"
                "P1,apple.mp4,APPLE,A_03_054\n",
                encoding="utf-8",
            )
            catalog = SignCatalog.from_csv(path)
            with patch.object(api.runtime, "catalog", catalog), patch.object(
                api.runtime, "dataset_root", Path(directory)
            ), patch.object(api, "is_configured", return_value=False):
                response = asyncio.run(api.translate_text(api.TranslationRequest(text="APPLE unknown")))

        self.assertEqual(response["translation_source"], "local_word_lookup")
        self.assertEqual(response["glosses"], ["APPLE"])
        self.assertEqual(response["unsupported_glosses"], ["unknown"])
        self.assertTrue(response["sequence"][0]["supported"])
        self.assertIsNone(response["sequence"][0]["pose_url"])
        self.assertEqual(response["sequence"][0]["reference"]["video_id"], "apple.mp4")


if __name__ == "__main__":
    unittest.main()
