from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import datetime

from app.database import get_db
from app.auth import get_current_user
from app import models, schemas, groq_client

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=schemas.SessionOut)
def create_session(payload: schemas.SessionCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Module 1: Interview Session Manager.
    Inputs: resume, role, experience. Output: a new interview session + generated questions.
    """
    session = models.InterviewSession(
        user_id=current_user["sub"],
        resume_text=payload.resume_text,
        role=payload.role,
        experience=payload.experience,
        status="created",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Module 2: Question Generation Engine
    try:
        questions = groq_client.generate_questions(
            payload.resume_text, payload.role, payload.experience, payload.num_questions
        )
    except Exception as e:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=502, detail=f"Question generation failed: {e}")

    for i, q in enumerate(questions):
        db.add(models.Question(
            session_id=session.id,
            order_index=i,
            text=q.get("text", "").strip(),
            category=q.get("category", "general"),
        ))
    session.status = "in_progress"
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=schemas.SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    session = db.query(models.InterviewSession).get(session_id)
    if not session or session.user_id != current_user["sub"]:
        raise HTTPException(404, "Session not found")
    return session


@router.get("/{session_id}/questions", response_model=list[schemas.QuestionOut])
def get_questions(session_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Question)
        .filter(models.Question.session_id == session_id)
        .order_by(models.Question.order_index)
        .all()
    )


@router.post("/{session_id}/complete", response_model=schemas.SessionOut)
def complete_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.InterviewSession).get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    session.status = "completed"
    session.completed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session
