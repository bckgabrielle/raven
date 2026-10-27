# Raven — learn ASL

Raven is a local-first research prototype for an English/audio → ASL gloss draft → recorded pose clip → Blender avatar workflow. It combines a Next.js web app, a FastAPI backend, the ASL-Citizen isolated-sign dataset, MediaPipe pose extraction, and exported Jack/Jill avatar rigs.

The avatar is the center of the product experience. Today, Raven can preview its 3D rigs and experimentally replay selected, locally prepared sign-pose clips. Longer-term, Raven aims to help learners explore signs and to make conversations or event content more accessible to Deaf and hard-of-hearing people. That communication-assistance experience is a vision—not a current real-time translation feature.

> **Important limitations:** Raven is not a fluent or validated English-to-ASL translator, an interpreter, or a substitute for a qualified interpreter. Its generated glosses are unreviewed, local text fallback is exact word lookup, and avatar playback uses isolated sign examples rather than fluent sentence-level ASL. Do not rely on Raven for critical communication.


=======
## What Raven can do today

- Practice ASL fingerspelling using optional static alphabet images from a Kaggle dataset.
- Enter English text or upload a text file and request an unreviewed ASL gloss draft through the configured Groq service.
- Record or upload audio for Groq transcription, then review the transcript before continuing.
- Fall back to exact local gloss lookup if Groq gloss generation is unavailable. This is not translation.
- Find matching isolated ASL-Citizen reference videos when the local dataset is configured.
- Extract body and hand landmarks locally from selected ASL-Citizen videos and experimentally retarget available pose tracks to the Raven avatar.
- Preview the Jack and Jill Blender rigs and experimental hand-keyed `HELLO` and `THANK-YOU` gestures.
- Optionally recognize a single isolated sign video if a compatible classifier checkpoint has been trained and configured.

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
[ASL Citizen paper](https://arxiv.org/abs/2304.05934)

> Desai, A. et al. “ASL Citizen: A Community-Sourced Dataset for Advancing Isolated Sign Language Recognition.” 2023. [arXiv:2304.05934](https://arxiv.org/abs/2304.05934).


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



## Responsible-use note

ASL is a full language, not English represented word-for-word with signs. Signing varies among people and communities. Raven is an experimental learning/research prototype whose gloss output and avatar movements are not validated translations. Involve Deaf ASL users and qualified ASL experts in design and evaluation. Protect signer privacy, obtain appropriate consent, and use qualified interpreters when interpretation is required.

## Project license

Original Raven code in this repository is made available under the [MIT License](./LICENSE). This license does **not** apply to datasets, third-party libraries, fonts, or avatar/Blender assets unless their respective owners separately grant those rights. In particular, ASL Citizen remains subject to Microsoft's research license and use restrictions; the Kaggle alphabet dataset remains subject to its dataset license. See [LICENSE](./LICENSE) and the dataset terms above.

