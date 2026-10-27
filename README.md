# Raven

## Intended product pipeline
Raven is a local-first research prototype for an English/audio → ASL gloss draft → recorded pose clip → Blender avatar workflow. It combines a Next.js web app, a FastAPI backend, the ASL-Citizen isolated-sign dataset, MediaPipe pose extraction, and exported Jack/Jill avatar rigs.

> **Important:** This is not a fluent ASL translator. Groq drafts are unreviewed, the local fallback is exact word lookup, and avatar motion replays isolated recorded signs. The prototype does not provide ASL grammar, facial expression, or non-manual markers. Do not use it for critical communication.

## What the app can do

3. Backend prepares and queues the text
   It cleans and standardizes the text, then sends it to the AI model.
- Accept typed English or audio; optionally transcribe audio with Groq Whisper.
- Request an unreviewed ASL gloss draft from Groq.
- If Groq gloss drafting is unavailable, find exact gloss/word matches in the local training CSV. This fallback is not translation.
- Show local dataset reference videos for matching glosses.
- Extract body and hand landmarks from dataset videos on the local computer and play available pose tracks on the Raven avatar.
- Upload one isolated sign video to a separately trained video-to-gloss classifier.
- Preview the included Jack and Jill 3D rigs and hand-keyed HELLO/THANK-YOU demonstrations.

Pose tracks are available only for glosses that have been extracted and contain usable landmarks. Adjacent clips are not sentence-level signing. The rig retarget is experimental and requires human review.

## Before cloning: make the project cloneable

6. Backend saves the result
   The target is to store the motion result, model version, source text, and request status.
The clone will contain only files committed and pushed to the repository. Before sharing a branch, make sure the source, README, and exported avatar assets (`frontend/public/raven-avatar.glb` and `frontend/public/raven-avatar-jill.glb`) are committed. Do **not** commit:

- Your `.env`, API keys, or other credentials.
- ASL-Citizen videos or split files.
- Extracted `derived\pose_tracks` data or trained model checkpoints.

Each collaborator must obtain the dataset under its own applicable license and configure their own local machine. Review the ASL-Citizen terms before using, sharing, or deploying derived pose tracks; local extraction does not remove dataset restrictions.

## Requirements

These instructions use Windows PowerShell.

## Current backend

The backend currently supports durable local signing-request status/results,
an SQLite-backed queue worker, exact single-gloss reference lookup, isolated
video-sign recognition, feedback intake, and authenticated local dataset
intake/review with consent/licence metadata and hashed manifests. It does not
yet translate English sentences, generate motion, or run landmark ETL. See
[backend/README.md](./backend/README.md) for setup, API routes, and limitations.

Gloss drafting can optionally use Groq or a local Meterless Nightshift
OpenAI-compatible endpoint. Drafts are validated against the catalog and remain
unreviewed; provider failures fall back to local exact-gloss lookup. Zetaris
Lightning Catalog can optionally serve catalog metadata through the configurable
REST contract documented in [backend/README.md](./backend/README.md); local CSV
and pose-track JSON files remain the fallback. Neither integration is used for
MediaPipe extraction, model training, or avatar animation. Copy [.env.example](./.env.example)
for local configuration and keep real credentials and data files untracked.
- Git.
- Python **3.12** (the commands below use the Python launcher `py -3.12`).
- Node.js **20.9 or newer** and npm (Next.js 16 requires Node 20.9+).
- Disk space for Python packages, local pose tracks, and the dataset videos.
- The ASL-Citizen dataset at a local path such as `D:\ASL_Citizen\ASL_Citizen`.
- Optional: a Groq API key for online transcription and gloss drafting.
- Optional: an NVIDIA GPU and a trained checkpoint for isolated-sign classification.
- Optional: Meterless Nightshift on Windows with compatible local model hardware.

Blender is **not** required for the normal web preview because the exported GLB avatar models are included. It is only needed to re-export the rigs after Blender edits.

## 1. Clone the repository

Use the repository URL and branch shared by the project owner:

```powershell
git clone https://github.com/bckgabrielle/raven.git
Set-Location raven
```

If the changes you need are on a feature branch, check it out before continuing:

```powershell
git switch <branch-name>
```

Check that both exported avatar files exist:

```powershell
Test-Path .\frontend\public\raven-avatar.glb
Test-Path .\frontend\public\raven-avatar-jill.glb
```

Both commands should return `True`. If they do not, ask the repository owner to push the avatar assets and the branch containing the pose-track implementation.

## 2. Install backend dependencies

From the repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

If PowerShell blocks virtual-environment activation, either allow scripts for this PowerShell session or use the environment's interpreter directly:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

The backend requirements include FastAPI, PyTorch, OpenCV, and a pinned MediaPipe release. MediaPipe processes dataset frames locally. Installation can take a while, particularly for PyTorch and OpenCV.

## 3. Prepare the local dataset

Obtain ASL-Citizen separately and place it outside the Git clone. The expected layout is:

```text
D:\ASL_Citizen\ASL_Citizen\
  splits\
    train.csv
    val.csv
    test.csv
  videos\
    <video files referenced by the split CSVs>
  use.txt
```

Check the paths and split names without moving the dataset into the repository:

```powershell
$dataset = "D:\ASL_Citizen\ASL_Citizen"
Test-Path "$dataset\splits\train.csv"
Test-Path "$dataset\splits\val.csv"
Test-Path "$dataset\videos"
```

The `test.csv` split is not used for pose extraction or model selection. Keep the videos and derived files on your local machine.

## 4. Extract pose tracks locally

Pose extraction is separate from classifier training. It runs MediaPipe Holistic and a hands-only recovery detector on local videos, then writes derived landmark JSON to:

```text
<dataset root>\derived\pose_tracks\
```

First extract one known training gloss to check your install and disk space. Run from the repository root, with the virtual environment active:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m asl_backbone.extract_pose_tracks --dataset-root "D:\ASL_Citizen\ASL_Citizen" --gloss "APPLE" --limit 1
```

To extract **all training examples for APPLE**, omit `--limit 1`:

```powershell
python -m asl_backbone.extract_pose_tracks --dataset-root "D:\ASL_Citizen\ASL_Citizen" --gloss "APPLE"
```

To extract the full training split, remove both `--gloss` and `--limit`:

```powershell
python -m asl_backbone.extract_pose_tracks --dataset-root "D:\ASL_Citizen\ASL_Citizen"
```

Existing tracks are skipped on reruns. Use `--overwrite` to regenerate them, `--fps 10` to save fewer frames per second, or `--split val` to process validation data. Extraction deliberately rejects the test split. Full-dataset extraction can take substantial time and disk space; check the dataset license before sharing any derived output.

## 5. Configure optional Groq access

Groq is optional. Without a Groq key, the app can still perform local exact-word lookup, show dataset references, and play extracted pose tracks. Groq is currently the only configured external gloss/transcription provider in Raven.

To enable it, create a **private, untracked root `.env` yourself** with the server-side settings:

```text
GROQ_API_KEY=<your key>
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_STT_MODEL=whisper-large-v3-turbo
```

The Python backend loads this file when it starts. Keep the key out of the frontend, browser storage, Git, screenshots, and messages. Never use a `NEXT_PUBLIC_` variable for a secret. The UI requires consent before submitting text/audio to Groq. Do not send dataset videos or extracted pose tracks to Groq.

Restart the backend after changing its environment configuration. Raven does not independently verify a user's Groq account or model access.

## 6. Start the backend

Open a PowerShell terminal at the repository root, activate `.venv`, and run:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
$env:ASL_DATASET_ROOT = "D:\ASL_Citizen\ASL_Citizen"
python -m uvicorn asl_backbone.api:app --host 127.0.0.1 --port 8000
```

Keep this terminal running. `ASL_DATASET_ROOT` is required for local catalog lookup, reference videos, and pose tracks. Set `ASL_CHECKPOINT` only if you have trained or otherwise obtained a compatible local classifier checkpoint:

```powershell
$env:ASL_CHECKPOINT = (Resolve-Path .\artifacts\asl_sign_model.pt).Path
```

The checkpoint is optional for text/audio gloss drafting and avatar playback.

Check that the backend is ready in a separate PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/health
```

The reference catalog should report as loaded when `ASL_DATASET_ROOT` is set. A recognizer status of `model_not_loaded` is normal if you did not configure `ASL_CHECKPOINT`.

## 7. Install and start the frontend

Open a **second** PowerShell terminal:

```powershell
Set-Location .\frontend
npm ci
$env:ASL_BACKEND_URL = "http://127.0.0.1:8000"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep both terminals running while using the app. `ASL_BACKEND_URL` is read by the Next.js server; it is not a browser-side API key. The backend defaults to `http://127.0.0.1:8000` if this variable is omitted.

## 8. Try a sign and avatar clip

After the backend and frontend are running:

1. Enter a short input containing an extracted gloss (for example, `APPLE`).
2. Review the gloss draft and its source/status; it is unreviewed.
3. Confirm the gloss is shown as having an available pose track.
4. Select **Play extracted signs** in the avatar panel.
5. Compare the avatar motion with the corresponding recorded reference video in the page.

If Groq is not configured, Raven's fallback matches words exactly against the dataset. It will not translate a general English sentence. To test the pose API directly, use:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/poses/APPLE
```

If the gloss has no track, run the extraction command for that exact training label. If no clip with usable hand/body landmarks exists, the API reports no pose track rather than claiming the sign can be animated.

## 9. Optional: train the isolated-sign recognizer

Training is **not required** for gloss-to-pose playback. It enables a separate feature: upload one isolated sign video and receive model predictions.

From the repository root, with the Python environment active:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m asl_backbone.train --dataset-root "D:\ASL_Citizen\ASL_Citizen" --output "artifacts\asl_sign_model.pt" --device auto
```

Training uses `train.csv`, selects with `val.csv`, and leaves `test.csv` untouched. Full training can require significant compute and time. Configure `ASL_CHECKPOINT` in the backend terminal and restart the backend to enable `/v1/recognize`.

## Meterless Nightshift: optional local model provider

[Meterless Nightshift for Windows](https://www.meterless.ai/windows.html) can serve local models through an OpenAI-compatible API. Its Windows edition requires a compatible Windows 10/11 machine and local model hardware; check the current product requirements before installation. Select a local-only model/runtime if you want inference to stay on your computer.

**Current integration status:** Raven does not currently send gloss-drafting requests to Meterless. Its gloss and transcription service is configured for Groq; setting a Meterless URL or installing Nightshift alone will not switch Raven to a local model. A small backend provider adapter/configuration change is required first. The frontend and avatar need not be rewritten for that provider change.

When a Meterless provider adapter is available, the setup should use the **actual API base URL, model identifier, and local runtime token shown by Nightshift**. Website examples are illustrative and are not guaranteed to be the values for your installation. Keep any token server-side. Test the local model from the same computer before configuring Raven, and verify the model can return Raven's expected JSON gloss shape. Do not assume a local model's ASL draft is more accurate than Groq.

Nightshift's free browser experience is useful for trying the product, but it is not by itself a local API connection for this Raven clone. Use the Windows application/runtime when Raven needs to call a local model.

## Zetaris: optional data catalog/query platform

[Zetaris Lightning Catalog](https://github.com/zetaris/lightning-catalog) is an open-source catalog/data-virtualization project. It is not an ASL model, pose extractor, or avatar runtime. [Zetaris Cloud](https://www.zetaris.com/cloud) describes a free cluster for evaluation, but the cloud page also notes cloud-provider compute charges; check current terms before creating resources.

**Current integration status:** Raven does not connect to Zetaris. It reads the ASL-Citizen CSV splits and local derived JSON directly. For this small local workflow, adding Zetaris would introduce another service without improving gloss accuracy or motion quality. Use it only if you later need federated SQL access to multiple data sources or a centrally managed catalog, and review the dataset license before registering or sharing any dataset-derived metadata.

No Zetaris account, token, or service is required to clone and run Raven.

## Troubleshooting

- **`Set ASL_DATASET_ROOT` / catalog unavailable:** Set the environment variable in the backend terminal to the folder containing `splits` and `videos`, then restart Uvicorn.
- **Pose button disabled:** The current gloss sequence has no successfully extracted local pose track. Run extraction for the exact CSV gloss and draft again.
- **Pose endpoint returns 404:** Confirm the training CSV contains that gloss and that extraction completed. The endpoint deliberately excludes clips without usable landmark coverage.
- **Frontend cannot reach backend:** Check that Uvicorn is still running on port 8000 and that `ASL_BACKEND_URL` is set in the frontend terminal.
- **Groq requests fail:** Check Groq account/model availability and the backend terminal errors. Without Groq, local exact word lookup remains available; audio transcription does not.
- **Rig does not load:** Check that the two `.glb` files exist under `frontend\public` and that the browser supports WebGL.
- **Windows packages fail to install:** Confirm Python 3.12 and install requirements inside the activated `.venv`; don't mix interpreter environments.

## Checks for contributors

Run from the repository root:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m unittest discover -s backend\tests -v
```

Run frontend checks from `frontend`:

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

## API overview

- `GET /v1/health` — backend, dataset catalog, and Groq configuration status.
- `POST /v1/translate` — unreviewed Groq gloss draft or local exact-word fallback, with reference and pose availability.
- `POST /v1/transcribe` — audio transcription; requires Groq.
- `GET /v1/poses/{gloss}` — locally extracted pose track for one gloss.
- `GET /v1/videos/{video_id}` — local reference video from the dataset.
- `POST /v1/recognize?top_k=5` — isolated-sign recognition; requires `ASL_CHECKPOINT`.

The frontend proxies these calls through same-origin `/api` routes. Keep the Python API bound to localhost unless you have reviewed authentication, dataset licensing, and deployment security.

## More detail

- [Model backbone, pose extraction, Blender export, and dataset restrictions](./MODEL_BACKBONE.md)
- [Frontend setup and behavior](./frontend/README.md)
