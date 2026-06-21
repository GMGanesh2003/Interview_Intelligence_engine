from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/sessions", tags=["video"])

EYE_CONTACT_DROP_WINDOW = 3  # consecutive non-eye-contact samples to flag a "drop" replay event


@router.post("/{session_id}/video-metrics")
def post_video_metrics(session_id: int, payload: schemas.VideoMetricBatchIn, db: Session = Depends(get_db)):
    """Module 3: Video Intelligence.
    The browser runs MediaPipe Face Mesh locally and posts batched samples here
    (eye contact, head movement, face visibility, posture) roughly once per second.
    """
    session = db.query(models.InterviewSession).get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    saved = []
    for m in payload.metrics:
        row = models.VideoMetric(
            session_id=session_id,
            timestamp_sec=m.timestamp_sec,
            eye_contact=m.eye_contact,
            head_movement=m.head_movement,
            face_visible=m.face_visible,
            posture_score=m.posture_score,
        )
        db.add(row)
        saved.append(row)
    db.commit()

    # Detect eye-contact-drop replay events: a run of consecutive "no eye contact" samples
    sorted_metrics = sorted(saved, key=lambda r: r.timestamp_sec)
    streak = 0
    for m in sorted_metrics:
        if not m.eye_contact and m.face_visible:
            streak += 1
            if streak == EYE_CONTACT_DROP_WINDOW:
                db.add(models.ReplayEvent(
                    session_id=session_id,
                    timestamp_sec=m.timestamp_sec,
                    event_type="eye_contact_drop",
                    label="Eye contact dropped",
                ))
        else:
            streak = 0
    db.commit()

    return {"saved": len(saved)}


@router.get("/{session_id}/video-summary")
def get_video_summary(session_id: int, db: Session = Depends(get_db)):
    metrics = db.query(models.VideoMetric).filter(models.VideoMetric.session_id == session_id).all()
    if not metrics:
        return {"eye_contact_pct": 0.0, "avg_head_movement": 0.0, "avg_posture_score": 0.0, "face_visible_pct": 0.0}

    n = len(metrics)
    return {
        "eye_contact_pct": round(sum(1 for m in metrics if m.eye_contact) / n * 100, 1),
        "avg_head_movement": round(sum(m.head_movement for m in metrics) / n, 3),
        "avg_posture_score": round(sum(m.posture_score for m in metrics) / n, 3),
        "face_visible_pct": round(sum(1 for m in metrics if m.face_visible) / n * 100, 1),
    }
