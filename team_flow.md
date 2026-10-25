## 1. AI Engineer — Build the ASL Intelligence

1. Define the model’s input and output.

The model receives normalized English text and returns a structured ASL performance plan:

```text
English text
→ ASL gloss/order
→ facial grammar
→ sign timing
→ body, hand, finger, and head motion data
```

2. Define the dataset requirements.

For every approved training example, capture:

- ASL video reference
- English meaning/transcript
- ASL gloss
- Timing
- Hand, body, face, and head landmarks
- Consent and licence status
- Review status

3. Build the ML ETL pipeline.

```text
approved video
→ extract landmarks
→ clean and normalize motion
→ align text/gloss/timing
→ create training record
→ quality check
```

4. Build a small first model.

Start with a constrained vocabulary and a small set of sentence types. The model should produce a valid `SignPerformance` result, even before it animates the rig.

5. Test with ASL reviewers.

Check whether the planned signs, order, timing, and facial grammar are understandable. Log every failure as training or annotation work.

Deliverable: a model API that receives text and returns versioned ASL performance and motion data.

## 2. Backend Engineer 1 — Data Intake and Dataset Operations

1. Build the training-data intake service.

```text
approved source video
→ secure upload/storage
→ metadata form
→ consent/licence record
→ available for AI ETL
```

2. Store source material safely.

Keep raw videos, transcripts, annotations, and extracted motion data separate. Raw signer videos must have stricter permissions than derived landmarks.

3. Run background data jobs.

The AI engineer submits jobs; this backend service runs and tracks them:

```text
extract landmarks
→ normalize motion
→ validate output
→ save results
→ report success or review needed
```

4. Create dataset versioning.

Every model-training run must point to an exact dataset version. No untracked “latest folder” should ever become training data.

Deliverable: secure storage, dataset manifests, job queue, and ETL-run history.

## 3. Backend Engineer 2 — Model API and Product Orchestration

1. Build the core signing-request API.

```text
text request
→ validate
→ send to AI model
→ receive SignPerformance result
→ store result
→ return result ID and status
```

2. Create the shared API contract.

The frontend should receive a clear result:

```text
request status
source text
ASL plan version
motion-data version
model version
supported / unsupported result
errors or review warnings
```

3. Make model deployment safe.

The AI engineer can publish a new model version without breaking existing results. Keep model versions, rollback support, logs, and performance tracking.

4. Prepare the future avatar handoff.

Store output in a way the future avatar player can consume directly:

```text
result ID
→ motion file or motion endpoint
→ facial-control track
→ timing data
→ avatar-rig version
```

Deliverable: production-shaped API between frontend, model, data services, and future avatar player.

## 4. Frontend Engineer 1 — User Input Experience

1. Build the starting screen.

Users can:

- Type text
- Paste text
- Upload a text/transcript file
- See examples of supported inputs

2. Build clear progress states.

```text
text submitted
→ preparing text
→ generating ASL performance
→ result ready
```

3. Build safe failure states.

If the input is too long, unsupported, sensitive, or unclear, tell the user plainly. Do not show an unreliable signing result as if it were correct.

4. Connect to the signing API.

The frontend submits a request and receives the result/status from Backend Engineer 2.

Deliverable: a polished input-to-result flow, even while the avatar is temporarily represented by a placeholder.

## 5. Frontend Engineer 2 — Result Experience and Future Avatar Player

1. Build the result screen.

For now, the page can show:

- Original input
- Request status
- Whether the model generated a supported ASL plan
- Model/result version
- A placeholder signing area

2. Build the animation-player shell.

Do not modify the rig yet. Instead, create the browser component that will later load:

```text
avatar model
+ motion sequence
+ facial-expression track
+ timing controls
```

3. Build playback controls now.

- Play
- Pause
- Restart
- Slow speed
- Request another translation

These controls can be tested with mock motion data until the avatar work resumes.

4. Test result handling.

Make sure long-running model jobs, errors, timeouts, and unsupported requests are clear to users.

Deliverable: an avatar-ready result player that can initially use placeholder content.

# Joint Team Checkpoints

## 1. Agree on the `SignPerformance` schema

The AI engineer, both backend engineers, and Frontend Engineer 2 must agree on this before implementation expands. It is the contract joining the model to the future avatar.

## 2. Prove one vertical slice

The first demo should be very small:

```text
typed “Hello”
→ backend request
→ AI result
→ stored motion plan
→ result page
→ placeholder player
```

Once that works, expand to additional reviewed phrases.

## 3. Keep the avatar isolated for now

The current rig is preserved as `Avatar v0`. The model produces avatar-independent motion data. Later, we build the retargeting layer that maps that data onto the rig.

## 4. Review model output with Deaf ASL experts

The team must not judge model quality only by whether the system runs. Deaf ASL reviewers decide whether the supported outputs are understandable and grammatically appropriate.
