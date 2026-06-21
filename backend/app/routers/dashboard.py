from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, groq_client

router = APIRouter(prefix="/api/sessions", tags=["dashboard"])


def _gather_raw_metrics(session_id: int, db: Session) -> dict:
    session = db.query(models.InterviewSession).get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    answers = (
        db.query(models.Answer)
        .join(models.Question)
        .filter(models.Question.session_id == session_id)
        .all()
    )
    video_metrics = db.query(models.VideoMetric).filter(models.VideoMetric.session_id == session_id).all()

    n_a = len(answers) or 1
    technical_avgs, communication_avgs = [], []
    filler_total, speed_total, energy_total, pause_total = 0, 0.0, 0.0, 0

    for a in answers:
        if a.technical_score:
            t = a.technical_score
            technical_avgs.append((t.correctness + t.depth + t.clarity + t.examples + t.reasoning) / 5)
        if a.communication_score:
            c = a.communication_score
            communication_avgs.append((c.grammar + c.clarity + c.conciseness + c.professionalism) / 4)
        if a.audio_metric:
            m = a.audio_metric
            filler_total += m.filler_word_count
            speed_total += m.speaking_speed_wpm
            energy_total += m.energy_score
            pause_total += m.pause_count

    n_video = len(video_metrics) or 1
    eye_contact_pct = round(sum(1 for v in video_metrics if v.eye_contact) / n_video * 100, 1) if video_metrics else 0.0
    avg_posture = round(sum(v.posture_score for v in video_metrics) / n_video, 2) if video_metrics else 0.0

    return {
        "session": session,
        "n_answers": len(answers),
        "technical_avg": round(sum(technical_avgs) / len(technical_avgs), 1) if technical_avgs else 0.0,
        "communication_avg": round(sum(communication_avgs) / len(communication_avgs), 1) if communication_avgs else 0.0,
        "filler_total": filler_total,
        "speed_avg": round(speed_total / n_a, 1) if answers else 0.0,
        "energy_avg": round(energy_total / n_a, 2) if answers else 0.0,
        "pause_total": pause_total,
        "eye_contact_pct": eye_contact_pct,
        "avg_posture": avg_posture,
    }


@router.get("/{session_id}/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(session_id: int, db: Session = Depends(get_db)):
    """Aggregates every module into the final scorecard shown on the results page."""
    raw = _gather_raw_metrics(session_id, db)

    # Confidence is a composite proxy: eye contact + posture + vocal energy + (inverse) filler rate
    filler_penalty = min(raw["filler_total"] * 2, 30)  # cap penalty at 30 points
    confidence_score = round(
        max(0.0, (raw["eye_contact_pct"] * 0.4) + (raw["avg_posture"] * 100 * 0.3)
            + (raw["energy_avg"] * 100 * 0.3) - filler_penalty),
        1,
    )
    overall_score = round(
        raw["technical_avg"] * 0.4 + raw["communication_avg"] * 0.25
        + confidence_score * 0.2 + raw["eye_contact_pct"] * 0.15,
        1,
    )

    summary_for_llm = {
        "role": raw["session"].role,
        "overall_score": overall_score,
        "technical_avg": raw["technical_avg"],
        "communication_avg": raw["communication_avg"],
        "eye_contact_pct": raw["eye_contact_pct"],
        "speaking_speed_avg_wpm": raw["speed_avg"],
        "filler_word_total": raw["filler_total"],
        "energy_avg": raw["energy_avg"],
    }
    try:
        recommendations = groq_client.generate_recommendations(summary_for_llm)
    except Exception:
        recommendations = [
            "Maintain steady eye contact with the camera throughout your answers.",
            "Reduce filler words by pausing silently instead of saying 'um' or 'like'.",
            "Structure technical answers with the STAR framework for more depth.",
        ]

    return {
        "session_id": session_id,
        "overall_score": overall_score,
        "confidence_score": confidence_score,
        "communication_score": raw["communication_avg"],
        "technical_score": raw["technical_avg"],
        "eye_contact_pct": raw["eye_contact_pct"],
        "energy_score": raw["energy_avg"],
        "filler_word_total": raw["filler_total"],
        "speaking_speed_avg": raw["speed_avg"],
        "recommendations": recommendations,
    }
