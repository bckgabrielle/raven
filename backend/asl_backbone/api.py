from __future__ import annotations

import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse

from .catalog import SignCatalog
from .data import sample_video
from .model import TemporalSignClassifier


class PlanRequest(BaseModel):
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
    description="Isolated-sign recognition and exact gloss-to-reference lookup.",
    lifespan=lifespan,
)


@app.get("/v1/health")
def health() -> dict[str, object]:
    return {
        "status": "ready" if runtime.model is not None else "model_not_loaded",
        "recognizer_loaded": runtime.model is not None,
        "reference_catalog_loaded": runtime.catalog is not None,
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
            }
        ],
        "motion_data": None,
        "warning": "This is one recorded example, not a grammatical sentence translation or avatar motion track.",
    }


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


def _unused_normalizer_reference() -> str:
    return normalize_gloss("")
