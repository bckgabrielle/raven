from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator


def _now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS signing_requests (
                    id TEXT PRIMARY KEY,
                    source_text TEXT NOT NULL,
                    normalized_text TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    error TEXT
                );
                CREATE TABLE IF NOT EXISTS signing_results (
                    id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL UNIQUE REFERENCES signing_requests(id),
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS feedback (
                    id TEXT PRIMARY KEY,
                    result_id TEXT NOT NULL REFERENCES signing_results(id),
                    category TEXT NOT NULL,
                    message TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS dataset_assets (
                    id TEXT PRIMARY KEY,
                    participant_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    gloss TEXT NOT NULL,
                    license_name TEXT NOT NULL,
                    license_url TEXT NOT NULL,
                    consent_confirmed INTEGER NOT NULL,
                    review_status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    source_deleted_at TEXT
                );
                CREATE TABLE IF NOT EXISTS dataset_versions (
                    id TEXT PRIMARY KEY,
                    manifest_json TEXT NOT NULL,
                    manifest_sha256 TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pose_extraction_jobs (
                    id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    pose_path TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS training_runs (
                    id TEXT PRIMARY KEY,
                    dataset_version_id TEXT NOT NULL,
                    manifest_sha256 TEXT NOT NULL,
                    status TEXT NOT NULL,
                    output_path TEXT,
                    checkpoint_sha256 TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            self._migrate(connection)

    def _migrate(self, connection: sqlite3.Connection) -> None:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(dataset_assets)")
        }
        if "source_deleted_at" not in columns:
            connection.execute(
                "ALTER TABLE dataset_assets ADD COLUMN source_deleted_at TEXT"
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def create_request(self, source_text: str, normalized_text: str) -> dict[str, Any]:
        request_id = str(uuid.uuid4())
        created_at = _now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO signing_requests
                    (id, source_text, normalized_text, status, created_at, updated_at)
                VALUES (?, ?, ?, 'queued', ?, ?)
                """,
                (request_id, source_text, normalized_text, created_at, created_at),
            )
        created = self.get_request(request_id)
        if created is None:
            raise RuntimeError("Signing request was inserted but could not be read back.")
        return created

    def get_request(self, request_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM signing_requests WHERE id = ?", (request_id,)
            ).fetchone()
            if row is None:
                return None
            request = dict(row)
            result = connection.execute(
                "SELECT id FROM signing_results WHERE request_id = ?", (request_id,)
            ).fetchone()
        request["result_id"] = result["id"] if result else None
        return request

    def claim_next_request(self) -> dict[str, Any] | None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT id FROM signing_requests
                WHERE status = 'queued'
                ORDER BY created_at, id LIMIT 1
                """
            ).fetchone()
            if row is None:
                return None
            cursor = connection.execute(
                """
                UPDATE signing_requests SET status = 'processing', updated_at = ?
                WHERE id = ? AND status = 'queued'
                """,
                (_now(), row["id"]),
            )
            if cursor.rowcount != 1:
                return None
            claimed = connection.execute(
                "SELECT * FROM signing_requests WHERE id = ?", (row["id"],)
            ).fetchone()
            return dict(claimed)

    def recover_interrupted_requests(self) -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE signing_requests SET status = 'queued', updated_at = ?
                WHERE status = 'processing'
                """,
                (_now(),),
            )
        return cursor.rowcount

    def set_request_status(
        self, request_id: str, status: str, error: str | None = None
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE signing_requests SET status = ?, updated_at = ?, error = ?
                WHERE id = ?
                """,
                (status, _now(), error, request_id),
            )

    def save_result(self, request_id: str, payload: dict[str, Any]) -> str:
        result_id = str(uuid.uuid4())
        payload_with_id = {
            **payload,
            "result_id": result_id,
            "result_url": f"/v1/results/{result_id}",
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO signing_results (id, request_id, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (result_id, request_id, json.dumps(payload_with_id), _now()),
            )
            connection.execute(
                """
                UPDATE signing_requests SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (payload["status"], _now(), request_id),
            )
        return result_id

    def get_result(self, result_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM signing_results WHERE id = ?", (result_id,)
            ).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def save_feedback(
        self, result_id: str, category: str, message: str | None
    ) -> str:
        feedback_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO feedback (id, result_id, category, message, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (feedback_id, result_id, category, message, _now()),
            )
        return feedback_id

    def delete_request(self, request_id: str) -> bool:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            request = connection.execute(
                "SELECT status FROM signing_requests WHERE id = ?", (request_id,)
            ).fetchone()
            if request is None:
                return False
            if request["status"] == "processing":
                raise ValueError("A processing request cannot be deleted.")
            result = connection.execute(
                "SELECT id FROM signing_results WHERE request_id = ?", (request_id,)
            ).fetchone()
            if result is not None:
                connection.execute(
                    "DELETE FROM feedback WHERE result_id = ?", (result["id"],)
                )
                connection.execute(
                    "DELETE FROM signing_results WHERE id = ?", (result["id"],)
                )
            cursor = connection.execute(
                "DELETE FROM signing_requests WHERE id = ?", (request_id,)
            )
        return cursor.rowcount > 0

    def save_dataset_asset(self, asset: dict[str, Any]) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO dataset_assets (
                    id, participant_id, filename, storage_path, sha256, gloss,
                    license_name, license_url, consent_confirmed, review_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    asset["id"],
                    asset["participant_id"],
                    asset["filename"],
                    asset["storage_path"],
                    asset["sha256"],
                    asset["gloss"],
                    asset["license_name"],
                    asset["license_url"],
                    int(asset["consent_confirmed"]),
                    asset["review_status"],
                    asset["created_at"],
                ),
            )

    def list_dataset_assets(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, participant_id, filename, sha256, gloss, license_name,
                       license_url, consent_confirmed, review_status, created_at,
                       source_deleted_at
                FROM dataset_assets ORDER BY created_at, id
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def update_asset_review(self, asset_id: str, review_status: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE dataset_assets SET review_status = ? WHERE id = ?",
                (review_status, asset_id),
            )
        return cursor.rowcount > 0

    def delete_dataset_asset(self, asset_id: str) -> str | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT storage_path FROM dataset_assets WHERE id = ?", (asset_id,)
            ).fetchone()
            if row is None:
                return None
            connection.execute("DELETE FROM dataset_assets WHERE id = ?", (asset_id,))
        return row["storage_path"]

    def get_dataset_asset_path(self, asset_id: str) -> str | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT storage_path FROM dataset_assets WHERE id = ?", (asset_id,)
            ).fetchone()
        return row["storage_path"] if row else None

    def create_dataset_version(self) -> dict[str, Any] | None:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, participant_id, filename, sha256, gloss, license_name,
                       license_url
                FROM dataset_assets
                WHERE consent_confirmed = 1 AND review_status = 'approved'
                ORDER BY id
                """
            ).fetchall()
        if not rows:
            return None
        manifest = {
            "schema_version": "1.0",
            "assets": [dict(row) for row in rows],
        }
        manifest_json = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
        manifest_sha256 = hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()
        version_id = f"dataset-{manifest_sha256[:16]}"
        created_at = _now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO dataset_versions
                    (id, manifest_json, manifest_sha256, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (version_id, manifest_json, manifest_sha256, created_at),
            )
            stored_version = connection.execute(
                "SELECT created_at FROM dataset_versions WHERE id = ?",
                (version_id,),
            ).fetchone()
        return {
            "id": version_id,
            "manifest_sha256": manifest_sha256,
            "created_at": stored_version["created_at"],
            "manifest": manifest,
        }

    def get_dataset_version(self, version_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM dataset_versions WHERE id = ?", (version_id,)
            ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "manifest_sha256": row["manifest_sha256"],
            "created_at": row["created_at"],
            "manifest": json.loads(row["manifest_json"]),
        }

    def get_dataset_asset(self, asset_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM dataset_assets WHERE id = ?", (asset_id,)
            ).fetchone()
        return dict(row) if row else None

    def enqueue_pose_job(self, asset_id: str) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        created_at = _now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT id FROM pose_extraction_jobs
                WHERE asset_id = ? AND status IN ('queued', 'processing')
                """,
                (asset_id,),
            ).fetchone()
            if existing is not None:
                raise ValueError("A pose extraction job is already active for this asset.")
            connection.execute(
                """
                INSERT INTO pose_extraction_jobs
                    (id, asset_id, status, created_at, updated_at)
                VALUES (?, ?, 'queued', ?, ?)
                """,
                (job_id, asset_id, created_at, created_at),
            )
        job = self.get_pose_job(job_id)
        if job is None:
            raise RuntimeError("Pose extraction job was inserted but could not be read back.")
        return job

    def get_pose_job(self, job_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM pose_extraction_jobs WHERE id = ?", (job_id,)
            ).fetchone()
        return dict(row) if row else None

    def claim_next_pose_job(self) -> dict[str, Any] | None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT id FROM pose_extraction_jobs
                WHERE status = 'queued'
                ORDER BY created_at, id LIMIT 1
                """
            ).fetchone()
            if row is None:
                return None
            cursor = connection.execute(
                """
                UPDATE pose_extraction_jobs SET status = 'processing', updated_at = ?
                WHERE id = ? AND status = 'queued'
                """,
                (_now(), row["id"]),
            )
            if cursor.rowcount != 1:
                return None
            claimed = connection.execute(
                "SELECT * FROM pose_extraction_jobs WHERE id = ?", (row["id"],)
            ).fetchone()
            return dict(claimed)

    def recover_interrupted_pose_jobs(self) -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE pose_extraction_jobs SET status = 'queued', updated_at = ?
                WHERE status = 'processing'
                """,
                (_now(),),
            )
        return cursor.rowcount

    def finish_pose_job(
        self,
        job_id: str,
        status: str,
        *,
        pose_path: str | None = None,
        error: str | None = None,
    ) -> None:
        if status not in {"succeeded", "needs_review", "failed"}:
            raise ValueError("Pose extraction jobs can only finish as succeeded, needs_review, or failed.")
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE pose_extraction_jobs
                SET status = ?, pose_path = ?, error = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, pose_path, error, _now(), job_id),
            )

    def expire_requests(self, cutoff_iso: str) -> int:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id FROM signing_requests
                WHERE created_at < ? AND status != 'processing'
                """,
                (cutoff_iso,),
            ).fetchall()
        removed = 0
        for row in rows:
            try:
                if self.delete_request(row["id"]):
                    removed += 1
            except ValueError:
                continue
        return removed

    def expire_source_videos(self, cutoff_iso: str, raw_root: Path) -> int:
        raw_root = raw_root.resolve()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, storage_path FROM dataset_assets
                WHERE created_at < ? AND source_deleted_at IS NULL
                  AND id NOT IN (
                      SELECT asset_id FROM pose_extraction_jobs
                      WHERE status IN ('queued', 'processing')
                  )
                """,
                (cutoff_iso,),
            ).fetchall()
        purged = 0
        deleted_at = _now()
        for row in rows:
            video_path = Path(row["storage_path"]).resolve()
            if video_path.parent != raw_root:
                continue
            video_path.unlink(missing_ok=True)
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    UPDATE dataset_assets SET source_deleted_at = ?
                    WHERE id = ? AND source_deleted_at IS NULL
                    """,
                    (deleted_at, row["id"]),
                )
                if cursor.rowcount:
                    purged += 1
        return purged

    def create_training_run(
        self, *, dataset_version_id: str, manifest_sha256: str, output_path: str
    ) -> str:
        run_id = str(uuid.uuid4())
        created_at = _now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO training_runs (
                    id, dataset_version_id, manifest_sha256, status, output_path,
                    created_at, updated_at
                ) VALUES (?, ?, ?, 'running', ?, ?, ?)
                """,
                (
                    run_id,
                    dataset_version_id,
                    manifest_sha256,
                    output_path,
                    created_at,
                    created_at,
                ),
            )
        return run_id

    def finish_training_run(
        self,
        run_id: str,
        status: str,
        *,
        checkpoint_sha256: str | None = None,
        error: str | None = None,
    ) -> None:
        if status not in {"completed", "failed"}:
            raise ValueError("Training runs can only finish as completed or failed.")
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE training_runs
                SET status = ?, checkpoint_sha256 = ?, error = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, checkpoint_sha256, error, _now(), run_id),
            )

    def get_training_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM training_runs WHERE id = ?", (run_id,)
            ).fetchone()
        return dict(row) if row else None
