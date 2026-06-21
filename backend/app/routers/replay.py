from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/sessions", tags=["replay"])


@router.get("/{session_id}/replay", response_model=list[schemas.ReplayEventOut])
def get_replay(session_id: int, db: Session = Depends(get_db)):
    """Module 9: Interview Replay.
    Returns a timeline of notable moments: filler words, eye-contact drops,
    strong answers, and long pauses, sorted chronologically.
    """
    events = (
        db.query(models.ReplayEvent)
        .filter(models.ReplayEvent.session_id == session_id)
        .order_by(models.ReplayEvent.timestamp_sec)
        .all()
    )
    return events
