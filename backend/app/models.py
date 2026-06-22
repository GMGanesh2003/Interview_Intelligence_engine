import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Text, Boolean, DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


def now():
    return datetime.datetime.utcnow()

# ---------------------------------------------------------------------------
# User Model
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_sub = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=True)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=now)

    sessions = relationship("InterviewSession", back_populates="user", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Module 1: Interview Session Manager
# ---------------------------------------------------------------------------
class InterviewSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.google_sub"), index=True, nullable=True) # Google 'sub' ID
    resume_text = Column(Text, nullable=False)
    role = Column(String, nullable=False)
    experience = Column(String, nullable=False)  # e.g. "fresher", "1-2 years"
    status = Column(String, default="created")  # created, in_progress, completed
    created_at = Column(DateTime, default=now)
    completed_at = Column(DateTime, nullable=True)

    questions = relationship("Question", back_populates="session", cascade="all, delete-orphan")
    video_metrics = relationship("VideoMetric", back_populates="session", cascade="all, delete-orphan")
    replay_events = relationship("ReplayEvent", back_populates="session", cascade="all, delete-orphan")
    user = relationship("User", back_populates="sessions")


# ---------------------------------------------------------------------------
# Module 2: Question Generation Engine
# ---------------------------------------------------------------------------
class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    order_index = Column(Integer, default=0)
    text = Column(Text, nullable=False)
    category = Column(String, default="general")  # technical, behavioral, general

    session = relationship("InterviewSession", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False, cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Module 5: Transcript Engine + Module 4: Audio Intelligence (linked to an answer)
# ---------------------------------------------------------------------------
class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"))
    audio_path = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)
    duration_sec = Column(Float, default=0.0)
    created_at = Column(DateTime, default=now)

    question = relationship("Question", back_populates="answer")
    audio_metric = relationship("AudioMetric", back_populates="answer", uselist=False, cascade="all, delete-orphan")
    technical_score = relationship("TechnicalScore", back_populates="answer", uselist=False, cascade="all, delete-orphan")
    communication_score = relationship("CommunicationScore", back_populates="answer", uselist=False, cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Module 3: Video Intelligence (sampled periodically during the session)
# ---------------------------------------------------------------------------
class VideoMetric(Base):
    __tablename__ = "video_metrics"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    timestamp_sec = Column(Float, nullable=False)
    eye_contact = Column(Boolean, default=False)
    head_movement = Column(Float, default=0.0)   # normalized 0-1 magnitude of movement
    face_visible = Column(Boolean, default=True)
    posture_score = Column(Float, default=1.0)   # 0-1, 1 = upright/centered

    session = relationship("InterviewSession", back_populates="video_metrics")


# ---------------------------------------------------------------------------
# Module 4: Audio Intelligence
# ---------------------------------------------------------------------------
class AudioMetric(Base):
    __tablename__ = "audio_metrics"

    id = Column(Integer, primary_key=True, index=True)
    answer_id = Column(Integer, ForeignKey("answers.id"))
    speaking_speed_wpm = Column(Float, default=0.0)
    pause_count = Column(Integer, default=0)
    pause_duration_total = Column(Float, default=0.0)
    filler_word_count = Column(Integer, default=0)
    filler_words_json = Column(JSON, default=list)  # [{"word": "um", "timestamp": 2.3}, ...]
    energy_score = Column(Float, default=0.0)  # 0-1 normalized vocal energy

    answer = relationship("Answer", back_populates="audio_metric")


# ---------------------------------------------------------------------------
# Module 6: Technical Depth Analyzer
# ---------------------------------------------------------------------------
class TechnicalScore(Base):
    __tablename__ = "technical_scores"

    id = Column(Integer, primary_key=True, index=True)
    answer_id = Column(Integer, ForeignKey("answers.id"))
    correctness = Column(Float, default=0.0)
    depth = Column(Float, default=0.0)
    clarity = Column(Float, default=0.0)
    examples = Column(Float, default=0.0)
    reasoning = Column(Float, default=0.0)
    star_detected = Column(JSON, default=dict)  # {"situation": true, "task": false, ...}
    feedback = Column(Text, default="")

    answer = relationship("Answer", back_populates="technical_score")


# ---------------------------------------------------------------------------
# Module 7: Communication Analyzer
# ---------------------------------------------------------------------------
class CommunicationScore(Base):
    __tablename__ = "communication_scores"

    id = Column(Integer, primary_key=True, index=True)
    answer_id = Column(Integer, ForeignKey("answers.id"))
    grammar = Column(Float, default=0.0)
    clarity = Column(Float, default=0.0)
    conciseness = Column(Float, default=0.0)
    professionalism = Column(Float, default=0.0)
    feedback = Column(Text, default="")

    answer = relationship("Answer", back_populates="communication_score")


# ---------------------------------------------------------------------------
# Module 8: Benchmark Engine
# ---------------------------------------------------------------------------
class BenchmarkProfile(Base):
    __tablename__ = "benchmark_profiles"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String, nullable=False, default="general")
    avg_eye_contact = Column(Float, default=0.8)
    avg_speaking_speed = Column(Float, default=140.0)
    avg_filler_rate_per_min = Column(Float, default=1.0)
    avg_technical_score = Column(Float, default=80.0)
    avg_communication_score = Column(Float, default=80.0)
    avg_energy_score = Column(Float, default=0.65)


# ---------------------------------------------------------------------------
# Module 9: Interview Replay
# ---------------------------------------------------------------------------
class ReplayEvent(Base):
    __tablename__ = "replay_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    timestamp_sec = Column(Float, nullable=False)
    event_type = Column(String, nullable=False)  # filler_word, eye_contact_drop, strong_answer, long_pause
    label = Column(String, nullable=False)

    session = relationship("InterviewSession", back_populates="replay_events")
