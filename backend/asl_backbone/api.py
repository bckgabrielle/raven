from __future__ import annotations

import os
import re
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import quote

import torch
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse

from .catalog import SignCatalog
from .data import VideoRecord, sample_video
from .groq_service import GroqServiceError, draft_glosses, is_configured, transcribe_audio
from .model import TemporalSignClassifier
from .pose_tracks import load_pose_track, pose_track_path, pose_track_quality


class PlanRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class Runtime:
    def __init__(self) -> None:
        self.dataset_root: Path | None = None
        self.catalog: SignCatalog | None = None
        self.model: TemporalSignClassifier | None = None
        self.classes: list[str] = []
        self.frame_count = 16
        self.image_size = 112
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    def load(self) -> None:
        dataset_setting = os.getenv("ASL_DATASET_ROOT")
        checkpoint_setting = os.getenv("ASL_CHECKPOINT")
        if dataset_setting:
            self.dataset_root = Path(dataset_setting).expanduser().resolve()
            self.catalog = SignCatalog.from_csv(
                self.dataset_root / "splits" / "train.csv"
            )
        if checkpoint_setting:
            checkpoint_path = Path(checkpoint_setting).expanduser().resolve()
            if not checkpoint_path.is_file():
                raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")
            checkpoint: dict[str, Any] = torch.load(
                checkpoint_path, map_location=self.device, weights_only=True
            )
            self.classes = checkpoint["classes"]
            self.frame_count = int(checkpoint["frame_count"])
            self.image_size = int(checkpoint["image_size"])
            self.model = TemporalSignClassifier(class_count=len(self.classes))
            self.model.load_state_dict(checkpoint["state_dict"])
            self.model.to(self.device)
            self.model.eval()


runtime = Runtime()


@asynccontextmanager
async def lifespan(_: FastAPI):
    runtime.load()
    yield


app = FastAPI(
    title="Raven ASL Model API",
    version="0.1.0",
    description="Speech transcription, unreviewed ASL gloss drafts, isolated-sign recognition, and local reference lookup.",
    lifespan=lifespan,
)


@app.get("/v1/health")
def health() -> dict[str, object]:
    return {
        "status": "ready" if runtime.model is not None else "model_not_loaded",
        "recognizer_loaded": runtime.model is not None,
        "reference_catalog_loaded": runtime.catalog is not None,
        "groq_configured": is_configured(),
        "model_version": "asl-citizen-video-gloss-v1",
    }


@app.get("/v1/signs")
def search_signs(query: str = Query(min_length=1, max_length=100)) -> dict[str, object]:
    if runtime.catalog is None:
        raise HTTPException(status_code=503, detail="Set ASL_DATASET_ROOT to enable the sign catalog.")
    return {"query": query, "glosses": runtime.catalog.search(query)}


@app.post("/v1/sign/plan")
def create_reference_plan(request: PlanRequest) -> dict[str, object]:
    if runtime.catalog is None:
        raise HTTPException(status_code=503, detail="Set ASL_DATASET_ROOT to enable reference lookup.")

    matches = runtime.catalog.lookup(request.text)
    if not matches:
        return {
            "status": "unsupported",
            "supported": False,
            "source_text": request.text,
            "sequence": [],
            "unsupported_text": request.text,
            "warning": "Only exact single-gloss reference lookup is available; this is not English-to-ASL translation.",
        }

    record = matches[0]
    return {
        "status": "reference_only",
        "supported": True,
        "source_text": request.text,
        "sequence": [
            {
                "index": 0,
                "gloss": record.gloss,
                "asl_lex_code": record.asl_lex_code,
                "video_id": record.video_file,
                "video_url": f"/v1/videos/{record.video_file}",
                "pose_url": _pose_url_for_gloss(record.gloss),
            }
        ],
        "motion_data": None,
        "warning": "This is one recorded example, not a grammatical sentence translation; avatar playback requires an extracted local pose track.",
    }


def _reference_for_gloss(gloss: str) -> dict[str, str] | None:
    if runtime.catalog is None or runtime.dataset_root is None:
        return None
    matches = runtime.catalog.lookup(gloss)
    if not matches:
        return None
    record = matches[0]
    return {
        "gloss": record.gloss,
        "asl_lex_code": record.asl_lex_code,
        "video_id": record.video_file,
        "video_url": f"/v1/videos/{record.video_file}",
    }


def _best_pose_track(gloss: str) -> tuple[VideoRecord, dict[str, Any]] | None:
    if runtime.catalog is None or runtime.dataset_root is None:
        return None
    best: tuple[VideoRecord, dict[str, Any]] | None = None
    best_quality = (-1.0, -1.0)
    for record in runtime.catalog.lookup(gloss):
        track = load_pose_track(pose_track_path(runtime.dataset_root, record.video_file))
        if track is None or track.get("video_id") != record.video_file:
            continue
        quality = pose_track_quality(track)
        if quality > best_quality:
            best = (record, track)
            best_quality = quality
    return best


def _pose_url_for_gloss(gloss: str) -> str | None:
    match = _best_pose_track(gloss)
    return f"/v1/poses/{quote(match[0].gloss, safe='')}" if match else None


def _local_word_lookup(text: str) -> tuple[list[str], list[str]]:
    tokens = re.findall(r"[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*", text)
    glosses: list[str] = []
    unsupported: list[str] = []
    for token in tokens:
        reference = _reference_for_gloss(token)
        if reference is None:
            unsupported.append(token)
        else:
            glosses.append(reference["gloss"])
    return glosses, unsupported


@app.post("/v1/translate")
async def translate_text(request: TranslationRequest) -> dict[str, object]:
    if runtime.catalog is None:
        raise HTTPException(
            status_code=503,
            detail="Set ASL_DATASET_ROOT to enable the local gloss/reference fallback.",
        )

    warnings = [
        "This is an unreviewed ASL gloss draft, not an authoritative translation.",
        "Dataset examples are isolated signs; avatar playback is available only for locally extracted pose tracks and does not validate sentence grammar.",
    ]
    translation_source = "local_word_lookup"
    try:
        if not is_configured():
            raise GroqServiceError("Groq is not configured.")
        proposed_glosses = await draft_glosses(request.text)
        translation_source = "groq_unreviewed"
    except GroqServiceError as error:
        proposed_glosses, local_unsupported = _local_word_lookup(request.text)
        warnings.append(
            f"Groq gloss drafting was unavailable ({error}); local word lookup is not translation."
        )
        sequence = []
        for gloss in proposed_glosses:
            reference = _reference_for_gloss(gloss)
            sequence.append(
                {
                    "gloss": gloss,
                    "supported": reference is not None,
                    "reference": reference,
                    "pose_url": _pose_url_for_gloss(gloss),
                }
            )
        return {
            "status": "draft",
            "source_text": request.text,
            "translation_source": translation_source,
            "model_version": "local-word-lookup-v1",
            "review_status": "unreviewed",
            "glosses": proposed_glosses,
            "sequence": sequence,
            "unsupported_glosses": local_unsupported,
            "warnings": warnings,
        }

    sequence = []
    unsupported_glosses = []
    for gloss in proposed_glosses:
        reference = _reference_for_gloss(gloss)
        sequence.append(
            {
                "gloss": gloss,
                "supported": reference is not None,
                "reference": reference,
                "pose_url": _pose_url_for_gloss(gloss),
            }
        )
        if reference is None:
            unsupported_glosses.append(gloss)

    return {
        "status": "draft",
        "source_text": request.text,
        "translation_source": translation_source,
        "model_version": os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile"),
        "review_status": "unreviewed",
        "glosses": proposed_glosses,
        "sequence": sequence,
        "unsupported_glosses": unsupported_glosses,
        "warnings": warnings,
    }


@app.get("/v1/poses/{gloss}")
def get_pose_track(gloss: str) -> dict[str, Any]:
    if runtime.catalog is None or runtime.dataset_root is None:
        raise HTTPException(
            status_code=503,
            detail="Set ASL_DATASET_ROOT to enable local pose-track lookup.",
        )
    if not runtime.catalog.lookup(gloss):
        raise HTTPException(status_code=404, detail="No dataset sign matches this gloss.")
    match = _best_pose_track(gloss)
    if match is not None:
        return match[1]
    raise HTTPException(
        status_code=404,
        detail="No pose track has been extracted for this gloss. Run the local pose-extraction command first.",
    )


MAX_AUDIO_BYTES = 25 * 1024 * 1024
AUDIO_EXTENSIONS = {".flac", ".mp3", ".mp4", ".m4a", ".mpeg", ".mpga", ".ogg", ".opus", ".wav", ".webm"}


@app.post("/v1/transcribe")
async def transcribe_audio_upload(audio: UploadFile = File(...)) -> dict[str, object]:
    if not is_configured():
        raise HTTPException(status_code=503, detail="Set GROQ_API_KEY on the backend to enable audio transcription.")
    filename = Path(audio.filename or "").name
    if Path(filename).suffix.lower() not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Use a supported audio file (WAV, MP3, M4A, OGG, FLAC, or WebM).")

    try:
        content = await audio.read(MAX_AUDIO_BYTES + 1)
        if not content:
            raise HTTPException(status_code=400, detail="The audio file is empty.")
        if len(content) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio uploads are limited to 25 MB.")
        transcript = await transcribe_audio(
            content,
            filename,
            audio.content_type or "application/octet-stream",
        )
        return {
            "status": "transcribed",
            "text": transcript,
            "model": os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo"),
        }
    except GroqServiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    finally:
        await audio.close()


@app.get("/v1/videos/{video_id}")
def get_reference_video(video_id: str) -> Any:
    if runtime.dataset_root is None or runtime.catalog is None:
        raise HTTPException(status_code=503, detail="Set ASL_DATASET_ROOT to enable reference videos.")
    if runtime.catalog.find_video(video_id) is None:
        raise HTTPException(status_code=404, detail="Reference video not found.")

    video_root = (runtime.dataset_root / "videos").resolve()
    video_path = (video_root / video_id).resolve()
    if video_path.parent != video_root or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Reference video not found.")
    return FileResponse(video_path, media_type="video/mp4", filename=video_path.name)


@app.post("/v1/recognize")
async def recognize_video(
    video: UploadFile = File(...),
    top_k: int = Query(default=5, ge=1, le=10),
) -> dict[str, object]:
    if runtime.model is None:
        raise HTTPException(status_code=503, detail="Set ASL_CHECKPOINT to enable video recognition.")
    suffix = Path(video.filename or "upload.mp4").suffix
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            shutil.copyfileobj(video.file, temporary)
        frames = sample_video(temporary_path, runtime.frame_count, runtime.image_size)
        with torch.inference_mode():
            logits = runtime.model(frames.unsqueeze(0).to(runtime.device))
            probabilities = torch.softmax(logits, dim=1)[0]
            scores, indices = torch.topk(probabilities, k=min(top_k, len(runtime.classes)))
        predictions = [
            {"gloss": runtime.classes[index], "confidence": float(score)}
            for score, index in zip(scores.cpu().tolist(), indices.cpu().tolist())
        ]
        return {
            "status": "recognized",
            "model_version": "asl-citizen-video-gloss-v1",
            "predictions": predictions,
            "warning": "This endpoint recognizes one isolated sign; it does not translate English or generate avatar motion.",
        }
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await video.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
