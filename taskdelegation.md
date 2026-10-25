# MVP Team Delegation

## 1. AI Engineer — Avatar, Data, and ASL Intelligence

1. Design and build the signing avatar.
   - Create the waist-up cartoon character.
   - Rig upper body, arms, wrists, palms, all finger joints, head, eyes, eyebrows, jaw, and mouth.
   - Create facial-expression controls for ASL non-manual markers.
   - Export an optimized avatar model compatible with the web renderer.

2. Define the motion format.
   - Specify the canonical skeletal format for upper-body, hand, finger, head, and facial data.
   - Define how a sign, its timing, and non-manual markers are represented.
   - Provide the retargeting rules from learned motion to the avatar rig.

3. Build the ASL data pipeline.
   - Define the required raw-data, consent, licensing, and annotation standards.
   - Ingest approved ASL videos.
   - Extract pose, hand, finger, face, and head landmarks.
   - Normalize, segment, clean, and version the resulting motion data.
   - Produce a reusable training dataset.

4. Build the model layer.
   - Create English-text-to-ASL-performance-plan logic.
   - Create the ASL-plan-to-motion model or hybrid motion/retrieval engine.
   - Build fingerspelling support and unknown-term handling.
   - Package the model for backend inference.

5. Test and validate signing quality.
   - Create offline tests for joint limits, motion smoothness, timing, and hand collisions.
   - Run linguistic validation sessions with Deaf ASL reviewers.
   - Track unsupported phrases and error patterns.

Deliverables:

- Rigged signing avatar and export files
- Avatar integration guide
- Motion-data schema and retargeting specification
- Versioned, licensed MVP training dataset
- ETL pipeline and dataset-quality reports
- ASL performance-plan schema
- Model/inference package
- Curated sign-motion library
- Validation report and supported-language boundaries

## 2. Frontend Engineer 1 — User Input and Product Flow

1. Build the user-facing input experience.
   - Typed-text entry
   - Paste-text support
   - Text-file upload
   - Clear limits, examples, and supported-use guidance

2. Build the request lifecycle.
   - Submit signing requests to the backend.
   - Show transcription/translation/animation generation states.
   - Handle errors, unsupported phrases, and retry paths.
   - Display the original English text alongside the ASL output context.

3. Build the initial user dashboard.
   - Recent requests
   - Saved phrases, if included in scope
   - Request status and result history

4. Build accessible interfaces.
   - Keyboard navigation
   - Clear labels and status announcements
   - Responsive layout for mobile and desktop
   - Respect reduced-motion settings in the surrounding interface

Deliverables:

- Text input and file-upload screens
- Request status, error, and unsupported-content states
- Responsive accessible product interface
- Frontend API integration for signing requests and results

## 3. Frontend Engineer 2 — Avatar Player and Signing Experience

1. Build the web avatar player.
   - Load the AI engineer’s avatar model.
   - Receive and play motion data from the backend.
   - Apply body, hand, finger, head, and facial-animation tracks together.
   - Maintain stable frame rates on target devices.

2. Build signing playback controls.
   - Play, pause, restart
   - Slow playback
   - Seek through the signed performance
   - Replay a phrase or individual sign where the data supports it

3. Optimize visual clarity.
   - Fixed signing-friendly camera framing
   - Good lighting and contrast
   - No UI elements obscuring hands or face
   - Clear fallback states if the avatar cannot load

4. Build the avatar-result view.
   - Show the avatar, source text, progress, and playback controls in one focused experience.
   - Connect the result to the user-flow work from Frontend Engineer 1.

Deliverables:

- Browser-based 3D avatar renderer/player
- Motion-playback and timing system
- Signing-focused camera, lighting, and responsive layout
- Playback controls and error handling
- Performance testing across supported browsers/devices

## 4. Backend Engineer 1 — Input, Files, and Job Processing

1. Build the input services.
   - Accept typed text and uploaded text files.
   - Validate file type, size, encoding, and content.
   - Normalize incoming text into a shared format.

2. Prepare for later speech support.
   - Define the audio-upload and transcription interfaces now, even if they are not enabled in the first MVP.
   - Integrate a speech-to-text provider when that milestone begins.

3. Build asynchronous job handling.
   - Queue signing requests.
   - Track request status from submission through completion.
   - Store failures and enable safe retries.

4. Handle user data safely.
   - Store uploads and results securely.
   - Set retention rules for uploaded data.
   - Provide deletion paths for users and internal data operations.

Deliverables:

- Input/file-upload API
- Text normalization service
- Background-job queue and status system
- Secure storage integration
- Request logging, retry behavior, and data-retention rules

## 5. Backend Engineer 2 — Signing Orchestration, APIs, and Platform Reliability

1. Build the signing-orchestration service.
   - Receive normalized text from the input service.
   - Send it to the AI inference service.
   - Store the returned ASL performance plan and motion output.
   - Return a signed-performance result that the avatar player can load.

2. Define and maintain API contracts.
   - Requests should return a job identifier.
   - Results should contain source text, ASL plan version, motion-data location/version, status, and supported/unsupported notices.
   - Version the API so model and avatar updates do not break the frontend.

3. Build model-serving infrastructure.
   - Containerize and deploy the AI inference service.
   - Manage model versions and rollbacks.
   - Add caching for repeated supported phrases.
   - Monitor latency, errors, cost, and resource usage.

4. Build observability and release controls.
   - Centralized logs and error tracking
   - Health checks
   - Feature flags for new models or sign libraries
   - Staging environment for end-to-end testing

Deliverables:

- Signing-orchestration API
- Model inference gateway
- Result storage and asset-delivery system
- Deployment, monitoring, caching, and rollback setup
- API documentation for both frontend engineers

# Joint Effort

## 1. Define the MVP boundary

All five engineers should agree on the first supported use cases, vocabulary, sentence length, file limits, unsupported-content behavior, and target devices. This prevents the frontend from implying support that the AI layer cannot yet provide.

## 2. Lock the shared contracts early

The AI engineer, avatar frontend engineer, and backend orchestration engineer need to jointly define:

- ASL performance-plan format
- Motion-data format
- Avatar asset format
- Request and result API schemas
- Model/version identifiers
- Error and fallback responses

This should happen before substantial implementation.

## 3. End-to-end integration

The team should jointly test:

```text
typed sentence
→ backend request
→ ASL plan
→ motion output
→ avatar playback
→ user controls and error states
```

The first end-to-end path should use a tiny set of reviewed phrases before expanding coverage.

## 4. Deaf ASL expert review

This is shared responsibility, although the AI engineer coordinates the technical response. The whole product team must observe review sessions because linguistic feedback can affect:

- Model output
- Avatar facial controls
- Hand visibility and camera choices
- Playback speed
- User messaging and product claims

A Deaf ASL linguist or reviewer is essential external participation; the five-person engineering team alone should not declare output linguistically correct.

## 5. MVP acceptance criteria

The team should jointly agree that the MVP is ready only when:

1. A user can enter or upload supported text.
2. The system produces a complete result reliably.
3. The avatar clearly renders upper-body, finger, hand, head, and facial motion.
4. Users can pause, replay, and slow signing.
5. Unsupported inputs fail clearly rather than generate misleading ASL.
6. Deaf ASL reviewers confirm the supported test set is understandable.
