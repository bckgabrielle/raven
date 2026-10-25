# raven

Pipeline:

1. User gives input
   Typed text, pasted text, uploaded transcript, or later speech/audio.

2. Frontend sends it to the backend
   The app validates the input and creates a signing request.

3. Backend prepares the text
   It cleans and standardizes the text, then sends it to the AI model.

4. AI model translates English into ASL
   It determines ASL word order, signs, facial grammar, timing, fingerspelling, and body language.

5. AI model creates motion instructions
   It outputs a structured sign-performance file containing:
   - Arm and upper-body movement
   - Wrist and palm orientation
   - Finger-joint movement
   - Head and eye movement
   - Eyebrow, mouth, and facial-expression controls
   - Timing for the complete phrase

6. Backend saves the result
   It stores the motion result, model version, source text, and request status.

7. Frontend receives the completed result
   It shows the user that the signing performance is ready.

8. Avatar player uses the motion instructions
   Later, the avatar rig reads the motion file and performs the ASL signing.

9. User watches and controls playback
   Play, pause, replay, slow down, or submit another phrase.

10. Quality data returns to the team
    Errors, unsupported phrases, and Deaf ASL reviewer feedback improve the dataset and model.

reminder to add license
