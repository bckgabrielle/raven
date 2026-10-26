This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Connect the local model

The frontend uses a same-origin Next.js API proxy. It forwards requests to the local FastAPI
service, so the browser does not need direct CORS access to the model API. The available model
supports exact single-gloss reference lookup and isolated-sign video recognition; it does not
translate English sentences or generate avatar motion.

From the repository root, install and start the Python backend in one PowerShell window:

```powershell
python -m pip install -r backend\requirements.txt
$env:PYTHONPATH = (Resolve-Path .\backend).Path
$env:ASL_DATASET_ROOT = "D:\ASL_Citizen\ASL_Citizen"
$env:ASL_CHECKPOINT = (Resolve-Path .\artifacts\asl_sign_model.pt).Path
python -m uvicorn asl_backbone.api:app --host 127.0.0.1 --port 8000
```

The checkpoint must first be trained using the instructions in the repository's
[model backbone guide](../MODEL_BACKBONE.md). If `ASL_CHECKPOINT` is not set, exact gloss reference
lookup still works, but uploaded-video recognition is unavailable.

In a second PowerShell window, from `frontend`, create `.env.local`:

```text
ASL_BACKEND_URL=http://127.0.0.1:8000
```

Then run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Search accepts one dataset gloss such as `APPLE`. Video recognition accepts MP4 files up to 50 MB.
Uploaded videos are sent to the configured backend; only upload footage you have permission to
process. Keep the service local. Review `ASL_Citizen\use.txt` before any deployment or sharing of
the dataset, checkpoints, or derived results. Feedback submission remains a simulated UI flow.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
