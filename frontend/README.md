# Raven frontend

Raven is presented as an ASL-learning prototype. The Next.js frontend proxies requests to the local FastAPI backend, keeping backend credentials out of the browser. The app supports:

- Optional ASL alphabet practice using local image samples from the [American Sign Language Dataset on Kaggle](https://www.kaggle.com/datasets/chaitanyakakade77/american-sign-language-dataset). Raven does not download the dataset on startup; see the repository README for setup.
- English text entry or `.txt` upload, followed by an unreviewed Groq-generated ASL gloss draft when configured.
- Microphone recording or audio upload, transcribed by Groq and returned as editable text.
- Local gloss/reference matching and isolated-sign video recognition when the backend is configured with the dataset and trained checkpoint.
- Previews of the exported Raven Jack and Jill Blender rigs, including local extracted pose-track playback and experimental, hand-keyed `HELLO` and `THANK-YOU` demos.

Pose playback is available only for glosses with locally extracted ASL-Citizen landmarks. It is an experimental retarget of isolated signs, not validated sentence grammar, fluent signing, or facial/non-manual signing. Groq output is not expert-reviewed ASL translation, and the local fallback is word lookup rather than translation. Read the repository's [README](../README.md) for setup, data licensing, API behavior, and limitations.

## Run locally

From the repository root, create `.env` containing the server-side Groq key and optional model IDs:

```text
GROQ_API_KEY=your_groq_api_key
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_STT_MODEL=whisper-large-v3-turbo
```

Start the Python backend in one PowerShell window:

```powershell
python -m pip install -r backend\requirements.txt
$env:PYTHONPATH = (Resolve-Path .\backend).Path
$env:ASL_DATASET_ROOT = "D:\ASL_Citizen\ASL_Citizen"
$env:ASL_CHECKPOINT = (Resolve-Path .\artifacts\asl_sign_model.pt).Path
python -m uvicorn asl_backbone.api:app --host 127.0.0.1 --port 8000
```

`ASL_CHECKPOINT` can be omitted when isolated-sign video recognition is not needed. The dataset path is needed for local gloss/reference matching.

Extract one local pose track before trying avatar playback. Replace `APPLE` with a gloss in the training split:

```powershell
$env:PYTHONPATH = (Resolve-Path .\backend).Path
python -m asl_backbone.extract_pose_tracks --dataset-root "D:\ASL_Citizen\ASL_Citizen" --gloss "APPLE" --limit 1
```

See the model backbone guide for whole-training-split extraction and the dataset restrictions.

In another PowerShell window:

```powershell
Set-Location frontend
"ASL_BACKEND_URL=http://127.0.0.1:8000" | Set-Content .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Audio is limited to 25 MB and requires the user's consent to submit to Groq. The backend key belongs only in the repository-root `.env`; do not use a `NEXT_PUBLIC_*` variable. Keep the backend bound to localhost unless the dataset license and deployment requirements have been reviewed.

## Validation

```powershell
npm run lint
npx tsc --noEmit
npm run build
```
