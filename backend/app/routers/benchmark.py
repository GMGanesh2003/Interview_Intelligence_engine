from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.routers.dashboard import _gather_raw_metrics

router = APIRouter(prefix="/api/sessions", tags=["benchmark"])


def _resolve_benchmark(role: str, db: Session) -> models.BenchmarkProfile:
    role_norm = role.strip().lower()
    profile = db.query(models.BenchmarkProfile).filter(models.BenchmarkProfile.role == role_norm).first()
    if not profile:
        profile = db.query(models.BenchmarkProfile).filter(models.BenchmarkProfile.role == "general").first()
    return profile


@router.get("/{session_id}/benchmark")
def get_benchmark(session_id: int, db: Session = Depends(get_db)):
    """Module 8: Benchmark Engine.
    Compares this candidate's metrics against successful-placed-candidate
    benchmark profiles for the same role family and reports the gap.
    """
    raw = _gather_raw_metrics(session_id, db)
    profile = _resolve_benchmark(raw["session"].role, db)

    filler_rate_per_min = round(raw["filler_total"] / max(raw["n_answers"], 1), 2)

    user = {
        "eye_contact": round(raw["eye_contact_pct"] / 100, 3),
        "speaking_speed": raw["speed_avg"],
        "filler_rate_per_min": filler_rate_per_min,
        "technical_score": raw["technical_avg"],
        "communication_score": raw["communication_avg"],
        "energy_score": raw["energy_avg"],
    }
    benchmark = {
        "eye_contact": profile.avg_eye_contact,
        "speaking_speed": profile.avg_speaking_speed,
        "filler_rate_per_min": profile.avg_filler_rate_per_min,
        "technical_score": profile.avg_technical_score,
        "communication_score": profile.avg_communication_score,
        "energy_score": profile.avg_energy_score,
    }
    gap = {k: round(user[k] - benchmark[k], 2) for k in user}

    return {"role": profile.role, "user": user, "benchmark": benchmark, "gap": gap}
