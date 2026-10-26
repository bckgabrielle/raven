# Raven backend (local MVP)

This service provides persistent signing-request status/results, an SQLite-backed
single-process worker, feedback intake, and an authenticated local dataset
intake/review flow. Its existing ML model remains an **isolated-sign video
classifier**. It does not translate English sentences into grammatical ASL or
produce avatar motion.

## Run

From the repository root, install `backend/requirements.txt`, then start the API:

```powershell
$env:ASL_STATE_DIR = "C:\raven-data"
$env:ASL_ADMIN_TOKEN = "set-a-long-random-secret"
$env:ASL_DATASET_ROOT = "C:\asl-citizen"
$env:ASL_CHECKPOINT = "C:\models\asl-sign-model.pt"
python -m uvicorn asl_backbone.api:app --app-dir backend --host 127.0.0.1 --port 8000
```

`ASL_DATASET_ROOT` and `ASL_CHECKPOINT` are optional. The default state
directory is `backend/.raven-state/`. Keep it outside source control and back it
up appropriately; uploaded raw videos are stored under `raw-videos/`.

The local worker polls SQLite for queued requests and recovers requests that
were interrupted while processing. Run one Uvicorn worker for this SQLite/local
filesystem MVP. It does not provide a distributed queue or production
multi-instance coordination.

## API outline

- `POST /v1/requests` accepts `{ "text": "..." }` and returns a request ID.
- `GET /v1/requests/{request_id}` polls request status and result ID.
- `GET /v1/results/{result_id}` returns the versioned reference-only result.
- `POST /v1/results/{result_id}/feedback` stores reviewer/user feedback.
- Existing `/v1/signs`, `/v1/sign/plan`, `/v1/videos/{video_id}`, and
  `/v1/recognize` routes remain available.
- Admin routes under `/v1/admin/` require `X-Admin-Token` matching
  `ASL_ADMIN_TOKEN`. They support video intake, asset review, immutable
  SHA-256 dataset manifests, and deletion of source assets and signing requests.

Dataset uploads require an explicit consent confirmation and license name/URL.
New assets remain pending review and are excluded from manifests until an
administrator approves them. This records assertions and workflow status; it
does not verify that consent or licensing claims are legally valid.

## Current limits before production/translation

- Request jobs currently resolve only exact, single-gloss reference matches.
  A match is one reference clip, not a sentence translation.
- There is no landmark extraction/annotation ETL, training-set builder, or
  training-run-to-dataset-manifest linkage yet.
- No sentence-level ASL model, curated phrase library, motion generator, facial
  grammar track, or avatar-rig integration is included.
- Model checkpoint publication/rollback, training-run lineage to dataset
  versions, model-output caching, and production metrics/alerting are not
  implemented.
- The local admin token is a shared secret. There are no user accounts,
  per-user authorization, production secret management, or distributed object
  storage, or automatic retention schedule. Avoid exposing this MVP to
  untrusted networks or storing sensitive real signer data in it without a
  security/privacy review.
- Dataset version manifests are immutable audit snapshots; deleting an active
  source asset does not rewrite versions already created from it.

Run backend tests from the `backend` directory:

```powershell
python -m unittest discover -s tests -v
```
