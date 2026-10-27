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
$env:ASL_POSE_TRACKS_JSON = "C:\asl-citizen\pose_tracks\index.json"
$env:ASL_CHECKPOINT = "C:\models\asl-sign-model.pt"
$env:LLM_PROVIDER = "meterless"
$env:METERLESS_API_TOKEN = "set-the-meterless-token"
$env:METERLESS_MODEL = "nightshift"
$env:ZETARIS_BASE_URL = "http://127.0.0.1:9000"
$env:ZETARIS_API_TOKEN = "set-the-zetaris-token"
python -m uvicorn asl_backbone.api:app --app-dir backend --host 127.0.0.1 --port 8000
```

`ASL_DATASET_ROOT` and `ASL_CHECKPOINT` are optional. The default state
directory is `backend/.raven-state/`. Keep it outside source control and back it
up appropriately; uploaded raw videos are stored under `raw-videos/`.
Do not commit credentials, ASL-Citizen files, pose tracks, or model checkpoints;
the root `.gitignore` excludes environment files and common dataset/model formats.

## Optional gloss drafting and catalog integrations

Set `LLM_PROVIDER=groq` (default) or `LLM_PROVIDER=meterless`. Groq uses
`GROQ_API_KEY` and `GROQ_MODEL`. Meterless uses its OpenAI-compatible
`/chat/completions` route at `METERLESS_BASE_URL` (default
`http://127.0.0.1:8088/v1`), with `METERLESS_API_TOKEN` and `METERLESS_MODEL`.
The token is sent only by the backend. The response message must contain JSON
matching `{"glosses":["HELLO"]}` with one to eight gloss labels. Raven validates
the shape and verifies every label against the catalog. A failed, unavailable,
or unknown-gloss draft falls back to the existing exact local lookup. Drafts
remain marked unreviewed and do not produce motion or animation.

Zetaris is disabled unless `ZETARIS_BASE_URL` is set. Its optional bearer token
is `ZETARIS_API_TOKEN`. The configurable REST adapter expects these GET routes:

- `/catalog/glosses?query=<text>&limit=<n>` returns `{"glosses":["HELLO"]}` for
  search; with `exact=true`, lookup returns
  `{"records":[{"participant_id":"P1","video_id":"clip.mp4","gloss":"HELLO","asl_lex_code":"G_001"}]}`.
- `/catalog/videos/{video_id}` returns `{"record":{...}}` in the same record
  shape.
- `/catalog/videos/{video_id}/pose-tracks` returns
  `{"pose_tracks":[{"track_id":"pose-1","available":true,"format":"json"}]}`.

Each Zetaris query has a five-second timeout. Transport or response failures
are logged and fall back to local data. Local signs are read from
`ASL_DATASET_ROOT/splits/train.csv`; local pose availability can be indexed in
`ASL_POSE_TRACKS_JSON` (default `ASL_DATASET_ROOT/pose_tracks/index.json`) as
`{"tracks":[{"video_id":"clip.mp4","track_id":"pose-1","path":"pose-1.json","format":"json"}]}`.
The pose index reports availability and metadata only; it does not run
MediaPipe. Zetaris is not used for gloss generation, model training, or avatar
animation.

The local worker polls SQLite for queued requests and recovers requests that
were interrupted while processing. Run one Uvicorn worker for this SQLite/local
filesystem MVP. It does not provide a distributed queue or production
multi-instance coordination.

## API outline

- `POST /v1/requests` accepts `{ "text": "..." }` and returns a request ID.
- `GET /v1/requests/{request_id}` polls request status and result ID.
- `GET /v1/results/{result_id}` returns the versioned reference-only result.
- `GET /v1/provider-status` reports selected provider and configuration state
  for Groq, Meterless, and Zetaris, without returning tokens.
- `GET /v1/catalog/videos/{video_id}/pose-tracks` lists available pose-track
  metadata from Zetaris or the local JSON index.
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
