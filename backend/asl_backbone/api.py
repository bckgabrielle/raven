from __future__ import annotations

import mimetypes
import os
import hashlib
import json
import logging
import secrets
import re
import shutil
import threading
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse
from urllib.parse import quote

import torch
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse

from .alphabet_dataset import load_alphabet_samples
from .catalog import SignCatalog, ZetarisCatalog, read_pose_tracks
from .data import VideoRecord, sample_video
from .groq_service import GroqServiceError, is_configured, transcribe_audio
from .model import TemporalSignClassifier
from .pose_tracks import extract_video_pose, load_pose_track, pose_track_path, pose_track_quality
from .providers import (
    ProviderError,
    ProviderSettings,
    active_provider_name,
    draft_glosses,
    provider_configuration,
    reported_provider_name,
)
from .storage import Store


logger = logging.getLogger(__name__)
MAX_INTAKE_BYTES = 100 * 1024 * 1024
MAX_TEXT_FILE_BYTES = 64 * 1024
MAX_REQUEST_CHARS = 1000
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".webm"}
ISOLATED_POSE_WARNING = (
    "This is a recorded isolated-sign pose track, not a grammatical sentence translation "
    "or generated signing motion."
)
RETENTION_CHECK_SECONDS = 60


class PlanRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_REQUEST_CHARS)


class FeedbackRequest(BaseModel):
    category: Literal["incorrect", "unclear", "other"]
    message: str | None = Field(default=None, max_length=2000)


class AssetReviewRequest(BaseModel):
    review_status: Literal["approved", "rejected", "pending"]


class PoseJobRequest(BaseModel):
    asset_id: str = Field(min_length=1, max_length=100)


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_REQUEST_CHARS)


class Runtime:
    def __init__(self) -> None:
        self.dataset_root: Path | None = None
        self.catalog: SignCatalog | ZetarisCatalog | None = None
        self.pose_tracks_path: Path | None = None
        self.model: TemporalSignClassifier | None = None
        self.model_version = "asl-citizen-video-gloss-v1"
        self.store: Store | None = None
        self.state_root: Path | None = None
        self.worker_stop = threading.Event()
        self.worker_thread: threading.Thread | None = None
        self.classes: list[str] = []
        self.alphabet_samples: dict[str, list[Path]] = {}
        self.frame_count = 16
        self.image_size = 112
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.retention_days: int | None = None
        self.next_retention_check = 0.0

    def load(self) -> None:
        state_setting = os.getenv("ASL_STATE_DIR")
        self.state_root = (
            Path(state_setting).expanduser().resolve()
            if state_setting
            else Path(__file__).resolve().parents[1] / ".raven-state"
        )
        self.state_root.mkdir(parents=True, exist_ok=True)
        self.store = Store(self.state_root / "raven.sqlite3")
        self.retention_days = retention_days_from_env()
        recovered = self.store.recover_interrupted_requests()
        if recovered:
            logger.warning("Requeued %s interrupted signing requests", recovered)
        recovered_jobs = self.store.recover_interrupted_pose_jobs()
        if recovered_jobs:
            logger.warning("Requeued %s interrupted pose extraction jobs", recovered_jobs)

        dataset_setting = os.getenv("ASL_DATASET_ROOT")
        checkpoint_setting = os.getenv("ASL_CHECKPOINT")
        local_catalog: SignCatalog | None = None
        alphabet_setting = os.getenv("ASL_ALPHABET_DATASET_ROOT")
        if dataset_setting:
            self.dataset_root = Path(dataset_setting).expanduser().resolve()
            local_catalog = SignCatalog.from_csv(
                self.dataset_root / "splits" / "train.csv"
            )
        pose_setting = os.getenv("ASL_POSE_TRACKS_JSON")
        if pose_setting:
            self.pose_tracks_path = Path(pose_setting).expanduser().resolve()
        elif self.dataset_root is not None:
            self.pose_tracks_path = self.dataset_root / "pose_tracks" / "index.json"
        zetaris_url = os.getenv("ZETARIS_BASE_URL", "").strip()
        if local_catalog is not None or zetaris_url:
            self.catalog = ZetarisCatalog(
                local_catalog=local_catalog,
                base_url=zetaris_url,
                token=os.getenv("ZETARIS_API_TOKEN", "").strip(),
                pose_tracks_path=self.pose_tracks_path,
            )
        if alphabet_setting:
            self.alphabet_samples = load_alphabet_samples(
                Path(alphabet_setting).expanduser().resolve()
            )
        if checkpoint_setting:
            checkpoint_path = Path(checkpoint_setting).expanduser().resolve()
            if not checkpoint_path.is_file():
                raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")
            checkpoint: dict[str, Any] = torch.load(
                checkpoint_path, map_location=self.device, weights_only=True
            )
            self.classes = checkpoint["classes"]
            self.model_version = str(checkpoint.get("version", self.model_version))
            self.frame_count = int(checkpoint["frame_count"])
            self.image_size = int(checkpoint["image_size"])
            self.model = TemporalSignClassifier(class_count=len(self.classes))
            self.model.load_state_dict(checkpoint["state_dict"])
            self.model.to(self.device)
            self.model.eval()

    def start_worker(self) -> None:
        if self.worker_thread is not None and self.worker_thread.is_alive():
            return
        self.worker_stop.clear()
        self.worker_thread = threading.Thread(
            target=_request_worker, name="raven-signing-worker", daemon=True
        )
        self.worker_thread.start()

    def stop_worker(self) -> None:
        self.worker_stop.set()
        if self.worker_thread is not None:
            self.worker_thread.join(timeout=5)
            self.worker_thread = None


runtime = Runtime()


@asynccontextmanager
async def lifespan(_: FastAPI):
    runtime.load()
    runtime.start_worker()
    try:
        yield
    finally:
        runtime.stop_worker()


app = FastAPI(
    title="Raven ASL Model API",
    version="0.1.0",
    description=(
        "Persistent signing requests, dataset intake, ASL alphabet practice, speech "
        "transcription, unreviewed gloss drafts, isolated-sign recognition, and references."
    ),
    lifespan=lifespan,
)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "RAVEN_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Token"],
)


def get_store() -> Store:
    if runtime.store is None:
        runtime.load()
    assert runtime.store is not None
    return runtime.store


def retention_days_from_env() -> int | None:
    raw = os.getenv("ASL_RETENTION_DAYS", "").strip()
    if not raw:
        return None
    if not raw.isdigit() or int(raw) < 1:
        raise ValueError("ASL_RETENTION_DAYS must be a positive whole number of days.")
    return int(raw)


def _apply_retention() -> None:
    now = time.monotonic()
    if now < runtime.next_retention_check:
        return
    runtime.next_retention_check = now + RETENTION_CHECK_SECONDS
    if not runtime.retention_days or runtime.state_root is None:
        return
    cutoff = (datetime.now(UTC) - timedelta(days=runtime.retention_days)).isoformat()
    store = get_store()
    removed = store.expire_requests(cutoff)
    purged = store.expire_source_videos(cutoff, runtime.state_root / "raw-videos")
    if removed or purged:
        logger.info(
            "Retention removed %s signing requests and %s source videos",
            removed,
            purged,
        )


def _request_worker() -> None:
    while not runtime.worker_stop.is_set():
        try:
            _apply_retention()
            request = get_store().claim_next_request()
        except Exception:
            logger.exception("Signing request worker failed to read the queue")
            runtime.worker_stop.wait(1)
            continue
        if request is not None:
            _process_signing_request(request["id"])
            continue
        try:
            job = get_store().claim_next_pose_job()
        except Exception:
            logger.exception("Pose extraction worker failed to read the queue")
            runtime.worker_stop.wait(1)
            continue
        if job is not None:
            _process_pose_job(job["id"])
            continue
        runtime.worker_stop.wait(0.25)


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("ASL_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Administrative endpoints are disabled until ASL_ADMIN_TOKEN is configured.",
        )
    if x_admin_token is None or not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail="Invalid administrative token.")


def _normalize_text(text: str) -> str:
    return " ".join(text.split())


def _reference_sequence(text: str) -> tuple[list[dict[str, object]], str | None]:
    if runtime.catalog is None:
        return [], None

    try:
        provider_name = active_provider_name()
        draft = draft_glosses(text)
        sequence: list[dict[str, object]] = []
        for index, gloss in enumerate(draft.glosses):
            records = runtime.catalog.lookup(gloss)
            if not records:
                raise ProviderError(
                    f"The {provider_name} gloss draft included an unknown catalog gloss."
                )
            record = records[0]
            sequence.append(
                {
                    "index": index,
                    "gloss": record.gloss,
                    "asl_lex_code": record.asl_lex_code,
                    "video_id": record.video_file,
                    "video_url": f"/v1/videos/{record.video_file}",
                }
            )
        return sequence, provider_name
    except (ProviderError, ValueError) as error:
        logger.warning("Gloss drafting unavailable; falling back to exact local lookup: %s", error)

    matches = runtime.catalog.lookup(text)
    if not matches:
        return [], None
    record = matches[0]
    return (
        [
            {
                "index": 0,
                "gloss": record.gloss,
                "asl_lex_code": record.asl_lex_code,
                "video_id": record.video_file,
                "video_url": f"/v1/videos/{record.video_file}",
            }
        ],
        None,
    )


def _result_warning(is_draft: bool, has_motion: bool) -> str:
    if has_motion and is_draft:
        return (
            "This AI gloss draft is unreviewed and may be inaccurate. "
            + ISOLATED_POSE_WARNING
        )
    if has_motion:
        return ISOLATED_POSE_WARNING
    if is_draft:
        return (
            "This AI gloss draft is unreviewed and may be inaccurate; it is not a grammatical "
            "sentence translation or avatar motion track."
        )
    return (
        "This is one recorded example, not a grammatical sentence translation or avatar motion track."
    )


def _make_reference_result(request: dict[str, Any]) -> dict[str, Any]:
    sequence, draft_provider = _reference_sequence(request["normalized_text"])
    if not sequence:
        warning = (
            "The isolated-sign reference catalog is unavailable."
            if runtime.catalog is None
            else "Only exact single-gloss reference lookup is available; this is not English-to-ASL translation."
        )
        return {
            "schema_version": "1.0",
            "request_id": request["id"],
            "source_text": request["source_text"],
            "status": "unsupported",
            "supported": False,
            "plan_version": "reference-plan-v1",
            "motion_data_version": None,
            "model_version": runtime.model_version,
            "sequence": [],
            "motion_data": None,
            "gloss_provider": reported_provider_name(),
            "draft_status": "not_created",
            "warning": warning,
        }

    is_draft = draft_provider is not None
    motion_data, motion_version = _isolated_motion(sequence)
    return {
        "schema_version": "1.0",
        "request_id": request["id"],
        "source_text": request["source_text"],
        "status": "unreviewed_draft" if is_draft else "reference_only",
        "supported": True,
        "plan_version": "gloss-draft-v1" if is_draft else "reference-plan-v1",
        "motion_data_version": motion_version,
        "model_version": runtime.model_version,
        "sequence": sequence,
        "motion_data": motion_data,
        "gloss_provider": draft_provider or "local_exact_lookup",
        "draft_status": "unreviewed" if is_draft else "not_created",
        "warning": _result_warning(is_draft, motion_data is not None),
    }


def _process_pose_job(job_id: str) -> None:
    store = get_store()
    job = store.get_pose_job(job_id)
    if job is None:
        logger.error("Queued pose extraction job %s disappeared before processing", job_id)
        return
    asset = store.get_dataset_asset(job["asset_id"])
    if (
        asset is None
        or not asset["consent_confirmed"]
        or asset["review_status"] != "approved"
        or asset["source_deleted_at"]
    ):
        store.finish_pose_job(
            job_id,
            "failed",
            error="Pose extraction requires an approved consented source video that is still stored.",
        )
        return
    if runtime.state_root is None:
        store.finish_pose_job(job_id, "failed", error="Backend storage is not initialized.")
        return
    raw_root = (runtime.state_root / "raw-videos").resolve()
    video_path = Path(asset["storage_path"]).resolve()
    if video_path.parent != raw_root or not video_path.is_file():
        store.finish_pose_job(job_id, "failed", error="Stored source video is missing or outside raw-video storage.")
        return
    try:
        track = extract_video_pose(video_path, gloss=asset["gloss"], target_fps=15.0)
        track["video_id"] = asset["filename"]
        output_path = runtime.state_root / "derived" / "pose_tracks" / f"{asset['id']}.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = output_path.with_suffix(".json.tmp")
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(track, file, separators=(",", ":"), allow_nan=False)
        temporary_path.replace(output_path)
        if load_pose_track(output_path) is None:
            store.finish_pose_job(
                job_id,
                "needs_review",
                error="Extracted landmarks are not playable and need review.",
            )
            return
        store.finish_pose_job(job_id, "succeeded", pose_path=str(output_path))
        logger.info("Pose extraction job %s wrote %s", job_id, output_path)
    except ValueError as error:
        message = str(error)
        status = "needs_review" if "usable body and hand landmarks" in message else "failed"
        store.finish_pose_job(job_id, status, error=message)
    except Exception as error:
        logger.exception("Pose extraction job %s failed", job_id)
        store.finish_pose_job(job_id, "failed", error=str(error))


def _process_signing_request(request_id: str) -> None:
    store = get_store()
    request = store.get_request(request_id)
    if request is None:
        logger.error("Queued signing request %s disappeared before processing", request_id)
        return
    store.set_request_status(request_id, "processing")
    try:
        payload = _make_reference_result(request)
        result_id = store.save_result(request_id, payload)
        logger.info("Signing request %s completed as result %s", request_id, result_id)
    except Exception as error:
        logger.exception("Signing request %s failed", request_id)
        store.set_request_status(request_id, "failed", str(error))


@app.get("/v1/health")
def health() -> dict[str, object]:
    integrations = provider_status()
    return {
        "status": "ready" if runtime.model is not None else "model_not_loaded",
        "recognizer_loaded": runtime.model is not None,
        "reference_catalog_loaded": runtime.catalog is not None,
        "model_version": runtime.model_version,
        "request_store": "ready" if runtime.store is not None else "not_loaded",
        "active_gloss_provider": integrations["active_gloss_provider"],
        "providers": integrations["providers"],
        "zetaris": integrations["zetaris"],
        "alphabet_dataset_loaded": bool(runtime.alphabet_samples),
        "alphabet_letters_available": len(runtime.alphabet_samples),
        "groq_configured": is_configured(),
        "retention_days": runtime.retention_days,
    }


@app.get("/v1/provider-status")
def provider_status() -> dict[str, object]:
    configuration = provider_configuration()
    catalog = runtime.catalog
    zetaris_configured = bool(os.getenv("ZETARIS_BASE_URL", "").strip())
    zetaris_available = (
        catalog.available if isinstance(catalog, ZetarisCatalog) and zetaris_configured else None
    )
    return {
        "active_gloss_provider": configuration["active"],
        "providers": {
            "groq": configuration["groq"],
            "meterless": configuration["meterless"],
        },
        "zetaris": {
            "configured": zetaris_configured,
            "available": zetaris_available,
        },
    }


@app.post("/v1/requests", status_code=202)
def create_signing_request(request: PlanRequest) -> dict[str, object]:
    normalized = _normalize_text(request.text)
    if not normalized:
        raise HTTPException(status_code=422, detail="Text must contain non-whitespace characters.")
    created = get_store().create_request(request.text, normalized)
    return _accepted_request(created)


def _accepted_request(created: dict[str, Any]) -> dict[str, object]:
    return {
        "request_id": created["id"],
        "status": created["status"],
        "status_url": f"/v1/requests/{created['id']}",
    }


@app.post("/v1/requests/file", status_code=202)
async def create_signing_request_from_file(file: UploadFile = File(...)) -> dict[str, object]:
    filename = Path(file.filename or "").name
    try:
        if Path(filename).suffix.lower() != ".txt":
            raise HTTPException(status_code=415, detail="Upload a .txt file.")
        raw = await file.read(MAX_TEXT_FILE_BYTES + 1)
        if len(raw) > MAX_TEXT_FILE_BYTES:
            raise HTTPException(status_code=413, detail="Text uploads are limited to 64 KB.")
        if b"\x00" in raw:
            raise HTTPException(status_code=422, detail="Text file must be UTF-8 without null bytes.")
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise HTTPException(status_code=422, detail="Text file must be UTF-8.") from error
        if len(text) > MAX_REQUEST_CHARS:
            raise HTTPException(status_code=422, detail="Text must be 1000 characters or fewer.")
        normalized = _normalize_text(text)
        if not normalized:
            raise HTTPException(status_code=422, detail="Text must contain non-whitespace characters.")
        created = get_store().create_request(text, normalized)
        return _accepted_request(created)
    finally:
        await file.close()


@app.get("/v1/requests/{request_id}")
def get_signing_request(request_id: str) -> dict[str, object]:
    request = get_store().get_request(request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Signing request not found.")
    return {
        "request_id": request["id"],
        "source_text": request["source_text"],
        "status": request["status"],
        "created_at": request["created_at"],
        "updated_at": request["updated_at"],
        "error": request["error"],
        "result_id": request["result_id"],
        "result_url": f"/v1/results/{request['result_id']}" if request["result_id"] else None,
    }


@app.get("/v1/results/{result_id}")
def get_signing_result(result_id: str) -> dict[str, Any]:
    result = get_store().get_result(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Signing result not found.")
    return result


@app.delete(
    "/v1/admin/requests/{request_id}",
    dependencies=[Depends(require_admin)],
)
def delete_signing_request(request_id: str) -> dict[str, str]:
    try:
        deleted = get_store().delete_request(request_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Signing request not found.")
    return {"request_id": request_id, "status": "deleted"}


@app.post("/v1/results/{result_id}/feedback", status_code=201)
def submit_result_feedback(
    result_id: str, request: FeedbackRequest
) -> dict[str, str]:
    store = get_store()
    if store.get_result(result_id) is None:
        raise HTTPException(status_code=404, detail="Signing result not found.")
    feedback_id = store.save_feedback(result_id, request.category, request.message)
    return {"feedback_id": feedback_id, "status": "received"}


@app.get("/v1/alphabet")
def get_alphabet_dataset() -> dict[str, object]:
    letters = [
        {"letter": letter, "sample_count": len(samples)}
        for letter, samples in sorted(runtime.alphabet_samples.items())
    ]
    return {
        "available": bool(letters),
        "source": "chaitanyakakade77/american-sign-language-dataset",
        "letters": letters,
    }


@app.get("/v1/alphabet/{letter}/samples/{sample_index}")
def get_alphabet_sample(letter: str, sample_index: int) -> FileResponse:
    normalized_letter = letter.upper()
    if len(normalized_letter) != 1 or normalized_letter not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        raise HTTPException(status_code=404, detail="Alphabet sample not found.")
    samples = runtime.alphabet_samples.get(normalized_letter)
    if samples is None or sample_index < 0 or sample_index >= len(samples):
        raise HTTPException(status_code=404, detail="Alphabet sample not found.")
    sample_path = samples[sample_index]
    media_type = mimetypes.guess_type(sample_path.name)[0] or "application/octet-stream"
    return FileResponse(sample_path, media_type=media_type, filename=sample_path.name)


@app.get("/v1/signs")
def search_signs(query: str = Query(min_length=1, max_length=100)) -> dict[str, object]:
    if runtime.catalog is None:
        raise HTTPException(status_code=503, detail="Set ASL_DATASET_ROOT to enable the sign catalog.")
    return {"query": query, "glosses": runtime.catalog.search(query)}


@app.post("/v1/sign/plan")
def create_reference_plan(request: PlanRequest) -> dict[str, object]:
    if runtime.catalog is None:
        raise HTTPException(status_code=503, detail="Set ASL_DATASET_ROOT to enable reference lookup.")

    sequence, draft_provider = _reference_sequence(request.text)
    if not sequence:
        return {
            "status": "unsupported",
            "supported": False,
            "source_text": request.text,
            "sequence": [],
            "unsupported_text": request.text,
            "warning": "Only exact single-gloss reference lookup is available; this is not English-to-ASL translation.",
        }

    motion_data, motion_version = _isolated_motion(sequence)
    is_draft = draft_provider is not None
    return {
        "status": "unreviewed_draft" if is_draft else "reference_only",
        "supported": True,
        "source_text": request.text,
        "sequence": sequence,
        "motion_data": motion_data,
        "motion_data_version": motion_version,
        "gloss_provider": draft_provider or "local_exact_lookup",
        "draft_status": "unreviewed" if is_draft else "not_created",
        "warning": _result_warning(is_draft, motion_data is not None),
    }


@app.get("/v1/catalog/videos/{video_id}/pose-tracks")
def list_video_pose_tracks(video_id: str) -> dict[str, object]:
    if runtime.catalog is None:
        return {
            "video_id": video_id,
            "pose_tracks": read_pose_tracks(runtime.pose_tracks_path, video_id),
            "source": "local",
        }
    tracks = runtime.catalog.list_pose_tracks(video_id)
    remote = isinstance(runtime.catalog, ZetarisCatalog) and runtime.catalog.available is True
    return {
        "video_id": video_id,
        "pose_tracks": tracks,
        "source": "zetaris" if remote else "local",
    }


def _reference_for_gloss(gloss: str) -> dict[str, str] | None:
    if runtime.catalog is None:
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


def _isolated_motion(
    sequence: list[dict[str, object]],
) -> tuple[dict[str, Any] | None, str | None]:
    tracks: list[dict[str, Any]] = []
    for item in sequence:
        gloss = str(item["gloss"])
        match = _best_pose_track(gloss)
        if match is None:
            item["pose_url"] = None
            continue
        record, track = match
        pose_url = f"/v1/poses/{quote(record.gloss, safe='')}"
        item["pose_url"] = pose_url
        tracks.append(
            {
                "index": item.get("index", len(tracks)),
                "gloss": record.gloss,
                "video_id": record.video_file,
                "pose_url": pose_url,
                "fps": track["fps"],
                "frame_count": len(track["frames"]),
                "track": track,
            }
        )
    if not tracks:
        return None, None
    version_material = json.dumps(
        [
            {
                "video_id": track["video_id"],
                "fps": track["fps"],
                "frames": track["track"]["frames"],
            }
            for track in tracks
        ],
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    version = "isolated-pose-v1:" + hashlib.sha256(version_material.encode("utf-8")).hexdigest()[:16]
    return (
        {
            "schema_version": "isolated-pose-v1",
            "isolated_sign": True,
            "sentence_motion": False,
            "tracks": tracks,
        },
        version,
    )


def _word_tokens(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*", text)


def _local_word_lookup(text: str) -> tuple[list[str], list[str]]:
    glosses: list[str] = []
    unsupported: list[str] = []
    for token in _word_tokens(text):
        reference = _reference_for_gloss(token)
        if reference is None:
            unsupported.append(token)
        else:
            glosses.append(reference["gloss"])
    return glosses, unsupported


def _ungrounded_word_list(text: str) -> tuple[list[str], list[str]]:
    glosses = [token.upper() for token in _word_tokens(text)]
    return glosses, list(glosses)


@app.post("/v1/translate")
async def translate_text(request: TranslationRequest) -> dict[str, object]:
    warnings = [
        "This is an unreviewed ASL gloss draft, not an authoritative translation.",
        "Dataset examples are isolated signs; avatar playback is available only for locally extracted pose tracks and does not validate sentence grammar.",
    ]
    translation_source = "local_word_lookup"
    model_version = "local-word-lookup-v1"
    local_unsupported: list[str] | None = None
    provider_error: ProviderError | ValueError | None = None
    try:
        settings = ProviderSettings.from_env()
        proposed_glosses = draft_glosses(request.text).glosses
        translation_source = f"{settings.provider}_unreviewed"
        model_version = settings.model
    except (ProviderError, ValueError) as error:
        provider_error = error

    if provider_error is not None and runtime.catalog is None:
        proposed_glosses, local_unsupported = _ungrounded_word_list(request.text)
        warnings.append(
            "Gloss drafting is unavailable "
            f"({provider_error}), and no sign catalog is loaded. "
            "These are the words you entered, not ASL glosses or reference clips. "
            "Set ASL_DATASET_ROOT to match words to recorded signs."
        )
    elif provider_error is not None:
        proposed_glosses, local_unsupported = _local_word_lookup(request.text)
        warnings.append(
            f"Gloss drafting was unavailable ({provider_error}); local word lookup is not translation."
        )
    elif runtime.catalog is None:
        warnings.append(
            "No sign catalog is loaded, so these glosses have no reference clips. "
            "Set ASL_DATASET_ROOT to enable local reference lookup."
        )

    sequence = []
    unsupported_glosses = local_unsupported or []
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
        if reference is None and local_unsupported is None:
            unsupported_glosses.append(gloss)

    return {
        "status": "draft",
        "source_text": request.text,
        "translation_source": translation_source,
        "model_version": model_version,
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


@app.post(
    "/v1/admin/dataset-assets",
    status_code=201,
    dependencies=[Depends(require_admin)],
)
async def upload_dataset_asset(
    video: UploadFile = File(...),
    participant_id: str = Form(min_length=1, max_length=100),
    gloss: str = Form(min_length=1, max_length=200),
    license_name: str = Form(min_length=1, max_length=200),
    license_url: str = Form(min_length=1, max_length=1000),
    consent_confirmed: bool = Form(...),
) -> dict[str, Any]:
    if not consent_confirmed:
        await video.close()
        raise HTTPException(status_code=422, detail="Explicit signer consent is required.")
    parsed_license_url = urlparse(license_url)
    if parsed_license_url.scheme not in {"http", "https"} or not parsed_license_url.netloc:
        await video.close()
        raise HTTPException(status_code=422, detail="License URL must be an HTTP(S) URL.")
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        await video.close()
        raise HTTPException(status_code=415, detail="Upload an MP4, MOV, or WebM video.")
    if runtime.state_root is None:
        await video.close()
        raise HTTPException(status_code=503, detail="Backend storage is not initialized.")

    asset_id = str(uuid.uuid4())
    upload_root = runtime.state_root / "raw-videos"
    upload_root.mkdir(parents=True, exist_ok=True)
    destination = upload_root / f"{asset_id}{suffix}"
    temporary_path = upload_root / f".{asset_id}.uploading"
    digest = hashlib.sha256()
    total = 0
    try:
        with temporary_path.open("xb") as output:
            while chunk := await video.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_INTAKE_BYTES:
                    raise HTTPException(
                        status_code=413, detail="Video exceeds the 100 MB upload limit."
                    )
                digest.update(chunk)
                output.write(chunk)
        if total == 0:
            raise HTTPException(status_code=422, detail="Uploaded video is empty.")
        temporary_path.replace(destination)
        asset = {
            "id": asset_id,
            "participant_id": participant_id.strip(),
            "filename": destination.name,
            "storage_path": str(destination),
            "sha256": digest.hexdigest(),
            "gloss": gloss.strip(),
            "license_name": license_name.strip(),
            "license_url": license_url.strip(),
            "consent_confirmed": consent_confirmed,
            "review_status": "pending",
            "created_at": datetime.now(UTC).isoformat(),
        }
        get_store().save_dataset_asset(asset)
        return {
            "asset_id": asset_id,
            "sha256": asset["sha256"],
            "review_status": "pending",
            "message": "Asset is quarantined from dataset versions until reviewed.",
        }
    except Exception:
        temporary_path.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise
    finally:
        await video.close()


@app.get("/v1/admin/dataset-assets", dependencies=[Depends(require_admin)])
def list_dataset_assets() -> dict[str, object]:
    return {"assets": get_store().list_dataset_assets()}


@app.patch(
    "/v1/admin/dataset-assets/{asset_id}",
    dependencies=[Depends(require_admin)],
)
def review_dataset_asset(asset_id: str, request: AssetReviewRequest) -> dict[str, str]:
    if not get_store().update_asset_review(asset_id, request.review_status):
        raise HTTPException(status_code=404, detail="Dataset asset not found.")
    return {"asset_id": asset_id, "review_status": request.review_status}


@app.delete(
    "/v1/admin/dataset-assets/{asset_id}",
    dependencies=[Depends(require_admin)],
)
def delete_dataset_asset(asset_id: str) -> dict[str, str]:
    store = get_store()
    stored_path = store.get_dataset_asset_path(asset_id)
    if stored_path is None:
        raise HTTPException(status_code=404, detail="Dataset asset not found.")
    if runtime.state_root is None:
        raise HTTPException(status_code=503, detail="Backend storage is not initialized.")
    raw_root = (runtime.state_root / "raw-videos").resolve()
    video_path = Path(stored_path).resolve()
    if video_path.parent != raw_root:
        logger.error("Refusing to delete dataset asset outside raw-video storage: %s", video_path)
        raise HTTPException(status_code=500, detail="Stored dataset asset path is invalid.")
    video_path.unlink(missing_ok=True)
    store.delete_dataset_asset(asset_id)
    return {"asset_id": asset_id, "status": "deleted"}


@app.post(
    "/v1/admin/dataset-versions",
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_dataset_version() -> dict[str, Any]:
    version = get_store().create_dataset_version()
    if version is None:
        raise HTTPException(
            status_code=409,
            detail="No consented and approved assets are available for a dataset version.",
        )
    return version


@app.get(
    "/v1/admin/dataset-versions/{version_id}",
    dependencies=[Depends(require_admin)],
)
def get_dataset_version(version_id: str) -> dict[str, Any]:
    version = get_store().get_dataset_version(version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version not found.")
    return version


def _pose_job_response(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["id"],
        "asset_id": job["asset_id"],
        "status": job["status"],
        "error": job["error"],
        "pose_ready": job["status"] == "succeeded" and bool(job["pose_path"]),
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "status_url": f"/v1/admin/pose-jobs/{job['id']}",
    }


@app.post(
    "/v1/admin/pose-jobs",
    status_code=202,
    dependencies=[Depends(require_admin)],
)
def create_pose_job(request: PoseJobRequest) -> dict[str, Any]:
    store = get_store()
    asset = store.get_dataset_asset(request.asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Dataset asset not found.")
    if not asset["consent_confirmed"] or asset["review_status"] != "approved":
        raise HTTPException(
            status_code=409,
            detail="Pose extraction requires an approved asset with recorded consent.",
        )
    if asset["source_deleted_at"]:
        raise HTTPException(status_code=409, detail="Source video is no longer stored.")
    try:
        job = store.enqueue_pose_job(asset["id"])
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return _pose_job_response(job)


@app.get(
    "/v1/admin/pose-jobs/{job_id}",
    dependencies=[Depends(require_admin)],
)
def get_pose_job(job_id: str) -> dict[str, Any]:
    job = get_store().get_pose_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Pose extraction job not found.")
    return _pose_job_response(job)


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
            "model_version": runtime.model_version,
            "predictions": predictions,
            "warning": "This endpoint recognizes one isolated sign; it does not translate English or generate avatar motion.",
        }
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await video.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
