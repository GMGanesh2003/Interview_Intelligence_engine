# Interview Intelligence Engine

A working end-to-end implementation of all 9 modules from the plan:

| # | Module | Where it lives |
|---|--------|-----------------|
| 1 | Interview Session Manager | `backend/app/routers/sessions.py` |
| 2 | Question Generation Engine | `backend/app/groq_client.py` (Groq LLM) |
| 3 | Video Intelligence | `frontend/src/lib/useFaceTracking.ts` (MediaPipe Face Mesh, runs in-browser) + `backend/app/routers/video.py` |
| 4 | Audio Intelligence | `backend/app/audio_analysis.py` (Librosa) |
| 5 | Transcript Engine | `backend/app/groq_client.py` (Groq Whisper) |
| 6 | Technical Depth Analyzer | `backend/app/groq_client.py` + `backend/app/routers/answers.py` |
| 7 | Communication Analyzer | `backend/app/groq_client.py` + `backend/app/routers/answers.py` |
| 8 | Benchmark Engine | `backend/app/routers/benchmark.py` + `backend/app/seed.py` |
| 9 | Interview Replay | `backend/app/routers/replay.py` + replay timeline UI on the results page |

**Stack used:** Next.js + TypeScript + Tailwind + hand-rolled shadcn-style components (frontend) ·
FastAPI (backend) · SQLite (database) · **Groq** for both the LLM (Llama 3.3) and Whisper speech-to-text.

---

## 1. Get a Groq API key

Free, at **https://console.groq.com/keys**. It powers question generation, technical/communication
scoring, AI recommendations, and speech-to-text (Whisper).

## 2. Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# open .env and paste your GROQ_API_KEY

uvicorn app.main:app --reload --port 8000
```

This creates `interview_engine.db` (SQLite) on first run and seeds benchmark profiles automatically.
API docs: http://localhost:8000/docs

> Librosa needs `ffmpeg`/`libsndfile` to decode the webm audio the browser sends. On Ubuntu/Debian:
> `sudo apt install ffmpeg libsndfile1`. On Mac: `brew install ffmpeg`. Windows: install ffmpeg and
> add it to PATH.

## 3. Run the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. Camera/microphone access is required — most browsers only allow
this over `localhost` or HTTPS, so don't deploy without TLS.

## 4. Use it

1. **Landing page** — paste a resume/background, set role + experience, start the interview.
   This calls Module 1 (session) and Module 2 (Groq generates the question list).
2. **Interview page** — grants camera/mic. MediaPipe Face Mesh runs **locally in your browser**
   (Module 3) and streams eye-contact / head-movement / posture samples to the backend every 5s.
   Click **Record answer**, speak, click **Stop**. The audio is sent to the backend, which runs
   the full pipeline: Whisper transcription (5) → Librosa audio analysis (4) → Groq technical (6)
   and communication (7) scoring → replay events (9) for filler words, long pauses, and strong answers.
3. **Results page** — aggregate scorecard, a radar chart benchmarking you against seeded
   "placed candidate" profiles (8), the full replay timeline (9), and AI-generated recommendations.

## Notes & honest limitations (read before treating this as production-ready)

- **Eye contact / posture are heuristics**, not ground truth. They're derived from head pose
  (yaw/pitch decoded from MediaPipe's facial transformation matrix) and face-box position — not a
  dedicated gaze-tracking or body-pose model. Good enough to demo the concept; for higher fidelity,
  add iris landmarks (gaze) and MediaPipe Pose (real posture from shoulders/spine).
- **Benchmark profiles are seeded placeholders** (`backend/app/seed.py`), not real placed-candidate
  data. Replace them with actual aggregated stats once you have some.
- **Audio is recorded as a separate per-question clip** (not one continuous interview recording),
  which keeps the Whisper/Librosa pipeline simple and fast per answer.
- No auth/multi-user accounts — it's single-user/local by design for an MVP. Add auth before
  deploying anywhere multi-tenant.
- Storage is local disk (`backend/storage/audio/`) and SQLite — fine for a hackathon/demo, swap for
  S3-like storage + Postgres for real scale.

## Project structure

```
backend/
  app/
    main.py          FastAPI app, CORS, router wiring
    database.py      SQLAlchemy/SQLite setup
    models.py        All 9 modules' tables
    schemas.py        Pydantic request/response models
    groq_client.py    Groq LLM + Whisper calls (modules 2, 5, 6, 7)
    audio_analysis.py Librosa-based audio intelligence (module 4)
    seed.py           Benchmark profile seed data (module 8)
    routers/
      sessions.py     Module 1 + 2
      video.py        Module 3
      answers.py      Modules 4, 5, 6, 7, 9 pipeline
      replay.py       Module 9
      dashboard.py     Aggregate scorecard
      benchmark.py     Module 8
frontend/
  src/
    app/
      page.tsx                 Landing / session setup
      interview/[id]/page.tsx  Webcam + recording + live telemetry
      results/[id]/page.tsx    Scorecard + benchmark chart + replay
    lib/
      useFaceTracking.ts   Module 3 (MediaPipe, runs in-browser)
      useAudioRecorder.ts  Mic capture
      api.ts               Backend client
    components/ui/        Hand-written shadcn-style Button/Card/Badge/Progress
```
