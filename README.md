# raven

## Intended product pipeline

1. User gives input
   Typed text, pasted text, uploaded transcript, or later speech/audio.

2. Frontend sends it to the backend
   The app validates the input and creates a signing request.

3. Backend prepares and queues the text
   It cleans and standardizes the text, then sends it to the AI model.

4. AI model translates English into ASL (future goal)
   The current model backbone recognizes isolated signs from video and can look up exact gloss reference clips. It does not translate English sentences or generate signing motion.

5. A future translation/retargeting model creates motion instructions
   It outputs a structured sign-performance file containing:
   - Arm and upper-body movement
   - Wrist and palm orientation
   - Finger-joint movement
   - Head and eye movement
   - Eyebrow, mouth, and facial-expression controls
   - Timing for the complete phrase

6. Backend saves the result
   The target is to store the motion result, model version, source text, and request status.

7. Frontend receives the completed result
   It shows the user that the signing performance is ready.

8. Avatar player uses the motion instructions
   Later, the avatar rig reads the motion file and performs the ASL signing.

9. User watches and controls playback
   Play, pause, replay, slow down, or submit another phrase.

10. Quality data returns to the team
    Errors, unsupported phrases, and Deaf ASL reviewer feedback improve the dataset and model.

## Current backend

The backend currently supports durable local signing-request status/results,
an SQLite-backed queue worker, exact single-gloss reference lookup, isolated
video-sign recognition, feedback intake, and authenticated local dataset
intake/review with consent/licence metadata and hashed manifests. It does not
yet translate English sentences, generate motion, or run landmark ETL. See
[backend/README.md](./backend/README.md) for setup, API routes, and limitations.
