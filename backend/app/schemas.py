import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
# ---------- Users ----------
class UserOut(BaseModel):
    id: int
    google_sub: str
    email: Optional[str]
    name: Optional[str]
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# ---------- Sessions ----------
class SessionCreate(BaseModel):
    resume_text: str
    role: str
    experience: str
    num_questions: int = 5


class SessionOut(BaseModel):
    id: int
    role: str
    experience: str
    status: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# ---------- Questions ----------
class QuestionOut(BaseModel):
    id: int
    order_index: int
    text: str
    category: str

    class Config:
        from_attributes = True


# ---------- Video metrics ----------
class VideoMetricIn(BaseModel):
    timestamp_sec: float
    eye_contact: bool
    head_movement: float
    face_visible: bool
    posture_score: float


class VideoMetricBatchIn(BaseModel):
    metrics: List[VideoMetricIn]


# ---------- Answers ----------
class AnswerOut(BaseModel):
    id: int
    question_id: int
    transcript: Optional[str]
    duration_sec: float
    audio_metrics: Optional[Dict[str, Any]] = None
    technical_score: Optional[Dict[str, Any]] = None
    communication_score: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ---------- Replay ----------
class ReplayEventOut(BaseModel):
    timestamp_sec: float
    event_type: str
    label: str

    class Config:
        from_attributes = True


# ---------- Dashboard / Benchmark ----------
class DashboardOut(BaseModel):
    session_id: int
    overall_score: float
    confidence_score: float
    communication_score: float
    technical_score: float
    eye_contact_pct: float
    energy_score: float
    filler_word_total: int
    speaking_speed_avg: float
    recommendations: List[str]


class BenchmarkOut(BaseModel):
    role: str
    user: Dict[str, float]
    benchmark: Dict[str, float]
    gap: Dict[str, float]
