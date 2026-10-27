# Raven — learn ASL

<<<<<<< Updated upstream
## Intended product pipeline
Raven is a local-first research prototype for an English/audio → ASL gloss draft → recorded pose clip → Blender avatar workflow. It combines a Next.js web app, a FastAPI backend, the ASL-Citizen isolated-sign dataset, MediaPipe pose extraction, and exported Jack/Jill avatar rigs.
=======
Raven is an early-stage, local-first prototype exploring how a 3D signing avatar can make ASL learning more visual and engaging, and how avatar-based signing might one day support access to spoken information in conversations and events.
>>>>>>> Stashed changes

The avatar is the center of the product experience. Today, Raven can preview its 3D rigs and experimentally replay selected, locally prepared sign-pose clips. Longer-term, Raven aims to help learners explore signs and to make conversations or event content more accessible to Deaf and hard-of-hearing people. That communication-assistance experience is a vision—not a current real-time translation feature.

> **Important limitations:** Raven is not a fluent or validated English-to-ASL translator, an interpreter, or a substitute for a qualified interpreter. Its generated glosses are unreviewed, local text fallback is exact word lookup, and avatar playback uses isolated sign examples rather than fluent sentence-level ASL. Do not rely on Raven for critical communication.

<<<<<<< Updated upstream
3. Backend prepares and queues the text
   It cleans and standardizes the text, then sends it to the AI model.
- Accept typed English or audio; optionally transcribe audio with Groq Whisper.
- Request an unreviewed ASL gloss draft from Groq.
- If Groq gloss drafting is unavailable, find exact gloss/word matches in the local training CSV. This fallback is not translation.
- Show local dataset reference videos for matching glosses.
- Extract body and hand landmarks from dataset videos on the local computer and play available pose tracks on the Raven avatar.
- Upload one isolated sign video to a separately trained video-to-gloss classifier.
- Preview the included Jack and Jill 3D rigs and hand-keyed HELLO/THANK-YOU demonstrations.
=======
## What Raven can do today
>>>>>>> Stashed changes

- Practice ASL fingerspelling using optional static alphabet images from a Kaggle dataset.
- Enter English text or upload a text file and request an unreviewed ASL gloss draft through the configured Groq service.
- Record or upload audio for Groq transcription, then review the transcript before continuing.
- Fall back to exact local gloss lookup if Groq gloss generation is unavailable. This is not translation.
- Find matching isolated ASL-Citizen reference videos when the local dataset is configured.
- Extract body and hand landmarks locally from selected ASL-Citizen videos and experimentally retarget available pose tracks to the Raven avatar.
- Preview the Jack and Jill Blender rigs and experimental hand-keyed `HELLO` and `THANK-YOU` gestures.
- Optionally recognize a single isolated sign video if a compatible classifier checkpoint has been trained and configured.

The supported pose clips depend on which dataset examples have been extracted and contain usable landmarks. A sequence of isolated clips does not convey ASL grammar, natural transitions, facial expressions, or non-manual markers.

<<<<<<< Updated upstream
6. Backend saves the result
   The target is to store the motion result, model version, source text, and request status.
The clone will contain only files committed and pushed to the repository. Before sharing a branch, make sure the source, README, and exported avatar assets (`frontend/public/raven-avatar.glb` and `frontend/public/raven-avatar-jill.glb`) are committed. Do **not** commit:
=======
## Product direction
>>>>>>> Stashed changes

Raven is being developed around two related experiences:

1. **Learn ASL:** use the avatar, reference signs, and alphabet examples to explore signs and practice.
2. **Communication assistance (future vision):** explore ways an avatar could help make conversations or events more accessible.

The second use case is not implemented as live speech-to-ASL translation. It will require Deaf-led research and co-design, qualified ASL expertise, consented and appropriately licensed data, evaluation, privacy safeguards, and careful validation before it can be presented as a dependable accessibility service.

## Technologies

| Area | Technology | Role and current status |
|---|---|---|
| Web application | Next.js, React, TypeScript | User interface and same-origin API proxies. |
| Backend API | Python, FastAPI, Pydantic | Local service for dataset lookup, pose and alphabet samples, transcription, gloss drafting, and optional sign recognition. |
| Language and speech services | Groq API | Optional audio transcription and unreviewed gloss drafting. Requests require user consent in the UI. |
| Video recognition | PyTorch, OpenCV | CNN + GRU isolated-sign classifier code; a trained checkpoint is optional and is not included. |
| Pose extraction | MediaPipe Holistic | Local extraction of body and hand landmarks from ASL-Citizen videos. |
| 3D avatar | Blender, exported GLB rigs, Three.js | Jack/Jill rig assets and experimental browser preview/pose retargeting. |
| Optional alphabet dataset download | KaggleHub | Explicit, user-triggered download helper; the app does not download the dataset on startup. |

### Zetaris and Meterless

Zetaris Lightning Catalog and Meterless Nightshift have been considered as possible supporting technologies, but **neither is integrated into Raven**:

- **Zetaris Lightning Catalog** is a data catalog/federation platform. Raven currently reads its local CSV/pose files directly; no Zetaris instance or connection is required.
- **Meterless Nightshift** may provide a local model-serving/runtime option on compatible hardware. Raven currently uses its Groq integration for configured transcription and gloss drafting; it does not send requests to Nightshift.

Installing either product does not change Raven's behavior. Treat both as future evaluation options, not current Raven dependencies or capabilities.

## Datasets and attribution

Raven can use the following datasets when a user obtains and configures them locally. Dataset contents are not included in this repository.

### American Sign Language Dataset — Kaggle

The optional alphabet-practice feature uses static image samples from [American Sign Language Dataset](https://www.kaggle.com/datasets/chaitanyakakade77/american-sign-language-dataset), published by **Chaitanya Kakade**. Kaggle lists the dataset license as **MIT**. The dataset is used as a local visual reference for alphabet practice; these images do not power the ASL-Citizen video classifier, provide dynamic fingerspelling recognition, or animate the avatar.

Raven does not redistribute the Kaggle images. Obtain them from Kaggle and review the current dataset page and license before reusing or redistributing the dataset or derived material. The MIT license for Raven's own code does not change the dataset's terms.

### ASL Citizen — Microsoft Research and collaborators

The optional isolated-sign recognition, local reference video, and pose-extraction workflow is designed for [ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/), a community-sourced isolated-sign dataset created by Microsoft Research and collaborators, with community contributors.

Microsoft Research's [ASL Citizen Dataset License](https://www.microsoft.com/en-us/research/project/asl-citizen/dataset-license/) limits use of the materials, including data, to **non-commercial, non-revenue-generating research purposes**. It also restricts redistribution of the data and modifications to it. Do not commit the videos, splits, derived pose tracks, or other dataset materials to this repository or distribute them through Raven. Obtain the data from the official [Microsoft download page](https://www.microsoft.com/en-us/download/details.aspx?id=105253), read the current license and consent terms, and independently determine whether your intended use is permitted. Contact Microsoft as directed by its license for commercial-use questions.

Please cite the [ASL Citizen paper](https://arxiv.org/abs/2304.05934) in research outputs:

> Desai, A. et al. “ASL Citizen: A Community-Sourced Dataset for Advancing Isolated Sign Language Recognition.” 2023. [arXiv:2304.05934](https://arxiv.org/abs/2304.05934).

## Run locally (Windows / PowerShell)

### Requirements

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
- Python 3.12 recommended.
- Node.js 20.9 or later and npm.
- Optional: ASL Citizen files, obtained under the dataset's terms.
- Optional: Kaggle access and authentication to download the alphabet images.
- Optional: a Groq API key for transcription and gloss drafting.
- Optional: a compatible trained checkpoint for isolated-sign recognition.
- Optional: Blender to edit or re-export the included rigs.

### 1. Clone and install

```powershell
git clone https://github.com/bckgabrielle/raven.git
Set-Location raven

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

In the frontend directory, install JavaScript dependencies:

```powershell
Set-Location frontend
npm ci
Set-Location ..
```

### 2. Configure optional data

ASL Citizen is optional for general frontend use, but is required for local sign references and pose extraction. Keep the dataset outside the Git clone. The backend expects a folder structure similar to:

```text
D:\ASL_Citizen\ASL_Citizen\
  splits\
    train.csv
    val.csv
    test.csv
  videos\
    <dataset videos>
```

To download the separate alphabet-image dataset, install KaggleHub and run Raven's optional downloader:

```powershell
python -m pip install kagglehub
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m asl_backbone.download_alphabet_dataset
```

The command reports the downloaded path after checking the letter-image folders. The app does not download this data automatically.

### 3. Configure optional Groq access

Groq is optional. Configure `GROQ_API_KEY` and, if desired, `GROQ_CHAT_MODEL` and `GROQ_STT_MODEL` in a private, untracked root `.env` file that you manage locally. Do not put credentials in frontend variables, commit them, or send them in messages. The repository ignores `.env`.

The UI asks for consent before sending text or audio to Groq. Audio is submitted for transcription; Raven does not send dataset videos or pose tracks to Groq. Without Groq, exact local word lookup may still work when ASL Citizen is configured, but audio transcription is unavailable.

### 4. Start the backend

Open a PowerShell terminal at the repository root. Set only the paths for datasets you have actually downloaded:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
$env:ASL_DATASET_ROOT = "D:\ASL_Citizen\ASL_Citizen"
# Optional: set this to the KaggleHub dataset path or its ASL_Data subfolder.
$env:ASL_ALPHABET_DATASET_ROOT = "C:\path\to\american-sign-language-dataset"
# Optional: set this if you have a compatible trained checkpoint.
# $env:ASL_CHECKPOINT = "C:\path\to\asl_sign_model.pt"
python -m uvicorn asl_backbone.api:app --host 127.0.0.1 --port 8000
```

If a dataset is not configured, omit its variable. Keep the backend bound to localhost for local development.
Confirm it is responding before opening the frontend:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/health
```

### 5. Start the frontend

Open a second PowerShell terminal:

```powershell
Set-Location frontend
$env:ASL_BACKEND_URL = "http://127.0.0.1:8000"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend can display its learning interface without the optional datasets; dataset-dependent features will be unavailable until the relevant local paths are configured and the backend is restarted.

`ASL_BACKEND_URL` is the backend **origin** only (for example, `http://127.0.0.1:8000`); do not append `/v1`. It defaults to that value if unset. Set it in the same terminal before starting Next.js, and restart the frontend after changing it. Keep both backend and frontend terminals running.

### Troubleshooting backend connections

- **Frontend API reports a 502 / could not reach model API:** start the FastAPI backend and confirm `http://127.0.0.1:8000/v1/health` responds. The frontend alone does not start the backend.
- **Alphabet panel reports no examples:** set `ASL_ALPHABET_DATASET_ROOT` in the backend terminal to the KaggleHub dataset directory and restart Uvicorn. Check that `GET http://127.0.0.1:8000/v1/alphabet` lists letters.
- **Avatar model appears, but extracted signs cannot play:** GLB loading is served by Next.js; extracted motion additionally requires ASL Citizen configured and a pose track for the requested gloss. Confirm `GET http://127.0.0.1:8000/v1/poses/HELLO` responds if that pose has been extracted.

### Optional pose extraction

Extract one training example first, replacing `APPLE` with a gloss in `splits\train.csv`:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m asl_backbone.extract_pose_tracks --dataset-root "D:\ASL_Citizen\ASL_Citizen" --gloss "APPLE" --limit 1
```

Pose data is written under the dataset's `derived\pose_tracks` folder, not into the Git repository. The extraction tool excludes the test split. Verify data licensing and storage requirements before extracting, sharing, or using any derived material.

### Optional classifier training

The video-to-gloss classifier is separate from avatar pose playback. To train it locally:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m asl_backbone.train --dataset-root "D:\ASL_Citizen\ASL_Citizen" --output "artifacts\asl_sign_model.pt" --device auto
```

Training requires local ASL Citizen data and may take substantial compute. Use the training and validation splits as intended by the training command; do not use test data for model selection. A trained checkpoint is not included.

## Architecture at a glance

```text
Next.js learning UI
  ├─ alphabet practice ─ same-origin proxy ─ FastAPI ─ local Kaggle image samples
  ├─ text/audio ─ same-origin proxy ─ FastAPI ─ optional Groq service
  ├─ sign references ─ FastAPI ─ local ASL Citizen CSV/videos
  ├─ pose playback ─ FastAPI ─ local derived landmarks ─ Three.js avatar
  └─ isolated video recognition ─ FastAPI ─ optional local PyTorch checkpoint
```

Zetaris and Meterless are not part of this request flow.

## Responsible-use note

ASL is a full language, not English represented word-for-word with signs. Signing varies among people and communities. Raven is an experimental learning/research prototype whose gloss output and avatar movements are not validated translations. Involve Deaf ASL users and qualified ASL experts in design and evaluation. Protect signer privacy, obtain appropriate consent, and use qualified interpreters when interpretation is required.

## Project license

Original Raven code in this repository is made available under the [MIT License](./LICENSE). This license does **not** apply to datasets, third-party libraries, fonts, or avatar/Blender assets unless their respective owners separately grant those rights. In particular, ASL Citizen remains subject to Microsoft's research license and use restrictions; the Kaggle alphabet dataset remains subject to its dataset license. See [LICENSE](./LICENSE) and the dataset terms above.

## Development checks

Run backend tests from the repository root:

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
