import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import Base, engine
from app.routers import sessions, video, answers, replay, dashboard, benchmark, users
from app.seed import seed

load_dotenv()

Base.metadata.create_all(bind=engine)
seed()

app = FastAPI(
    title="Interview Intelligence Engine API",
    description="Mock interview analysis: video, audio, transcript, technical depth, "
                 "communication, benchmarking, and replay.",
    version="1.0.0",
)

origins = [os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://interview-intelligence-engine.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(video.router)
app.include_router(answers.router)
app.include_router(replay.router)
app.include_router(dashboard.router)
app.include_router(benchmark.router)
app.include_router(users.router)


@app.get("/")
def health():
    return {"status": "ok", "service": "interview-intelligence-engine"}
