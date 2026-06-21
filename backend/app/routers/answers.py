import os
import uuid
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, groq_client, audio_analysis

router = APIRouter(prefix="/api/answers", tags=["answers"])

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage", "audio")
os.makedirs(STORAGE_DIR, exist_ok=True)

STRONG_ANSWER_THRESHOLD = 80  # avg(correctness, depth, clarity) >= this -> "strong answer" replay event
LONG_PAUSE_LABEL = "Long pause"
FILLER_LABEL_PREFIX = "Filler word"


@router.post("", response_model=schemas.AnswerOut)
async def submit_answer(
    question_id: int = Form(...),
    session_start_offset: float = Form(0.0),  # seconds since interview start, for replay timeline alignment
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Submit a recorded answer. Runs the full pipeline:
    Module 5 (Transcript) -> Module 4 (Audio Intelligence) -> Module 6 (Technical) ->
    Module 7 (Communication) -> Module 9 (Replay events).
    """
    question = db.query(models.Question).get(question_id)
    if not question:
        raise HTTPException(404, "Question not found")

    # Save audio file
    ext = os.path.splitext(audio.filename or "answer.webm")[1] or ".webm"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(STORAGE_DIR, filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    # Module 5: Transcript Engine (Whisper via Groq)
    try:
        stt = groq_client.transcribe_audio(file_path)
    except Exception as e:
        raise HTTPException(502, f"Transcription failed: {e}")

    transcript = stt["text"].strip()
    duration = stt["duration"] or 1.0
    words = stt["words"]

    answer = models.Answer(
        question_id=question_id,
        audio_path=file_path,
        transcript=transcript,
        duration_sec=duration,
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)

    # Module 4: Audio Intelligence
    audio_result = audio_analysis.analyze_audio(file_path, words, duration)
    audio_metric = models.AudioMetric(
        answer_id=answer.id,
        speaking_speed_wpm=audio_result["speaking_speed_wpm"],
        pause_count=audio_result["pause_count"],
        pause_duration_total=audio_result["pause_duration_total"],
        filler_word_count=audio_result["filler_word_count"],
        filler_words_json=audio_result["filler_words"],
        energy_score=audio_result["energy_score"],
    )
    db.add(audio_metric)

    # Module 6: Technical Depth Analyzer
    session = question.session
    try:
        tech = groq_client.analyze_technical_depth(question.text, transcript or "(no speech detected)", session.role)
    except Exception as e:
        tech = {"correctness": 0, "depth": 0, "clarity": 0, "examples": 0, "reasoning": 0,
                "star_detected": {}, "feedback": f"Technical analysis failed: {e}"}
    technical_score = models.TechnicalScore(
        answer_id=answer.id,
        correctness=tech.get("correctness", 0),
        depth=tech.get("depth", 0),
        clarity=tech.get("clarity", 0),
        examples=tech.get("examples", 0),
        reasoning=tech.get("reasoning", 0),
        star_detected=tech.get("star_detected", {}),
        feedback=tech.get("feedback", ""),
    )
    db.add(technical_score)

    # Module 7: Communication Analyzer
    try:
        comm = groq_client.analyze_communication(transcript or "(no speech detected)")
    except Exception as e:
        comm = {"grammar": 0, "clarity": 0, "conciseness": 0, "professionalism": 0,
                "feedback": f"Communication analysis failed: {e}"}
    communication_score = models.CommunicationScore(
        answer_id=answer.id,
        grammar=comm.get("grammar", 0),
        clarity=comm.get("clarity", 0),
        conciseness=comm.get("conciseness", 0),
        professionalism=comm.get("professionalism", 0),
        feedback=comm.get("feedback", ""),
    )
    db.add(communication_score)

    # Module 9: Interview Replay - log notable events on the session timeline
    for fw in audio_result["filler_words"]:
        db.add(models.ReplayEvent(
            session_id=session.id,
            timestamp_sec=session_start_offset + fw["timestamp"],
            event_type="filler_word",
            label=f'{FILLER_LABEL_PREFIX}: "{fw["word"]}"',
        ))
    for lp in audio_result["long_pause_timestamps"]:
        db.add(models.ReplayEvent(
            session_id=session.id,
            timestamp_sec=session_start_offset + lp,
            event_type="long_pause",
            label=LONG_PAUSE_LABEL,
        ))
    avg_tech = (tech.get("correctness", 0) + tech.get("depth", 0) + tech.get("clarity", 0)) / 3
    if avg_tech >= STRONG_ANSWER_THRESHOLD:
        db.add(models.ReplayEvent(
            session_id=session.id,
            timestamp_sec=session_start_offset,
            event_type="strong_answer",
            label="Strong answer",
        ))

    db.commit()
    db.refresh(answer)

    return {
        "id": answer.id,
        "question_id": answer.question_id,
        "transcript": answer.transcript,
        "duration_sec": answer.duration_sec,
        "audio_metrics": audio_result,
        "technical_score": tech,
        "communication_score": comm,
    }


@router.get("/by-question/{question_id}", response_model=schemas.AnswerOut)
def get_answer(question_id: int, db: Session = Depends(get_db)):
    answer = db.query(models.Answer).filter(models.Answer.question_id == question_id).first()
    if not answer:
        raise HTTPException(404, "No answer for this question yet")
    return {
        "id": answer.id,
        "question_id": answer.question_id,
        "transcript": answer.transcript,
        "duration_sec": answer.duration_sec,
        "audio_metrics": _audio_metric_dict(answer.audio_metric),
        "technical_score": _technical_dict(answer.technical_score),
        "communication_score": _communication_dict(answer.communication_score),
    }


def _audio_metric_dict(m):
    if not m:
        return None
    return {
        "speaking_speed_wpm": m.speaking_speed_wpm,
        "pause_count": m.pause_count,
        "pause_duration_total": m.pause_duration_total,
        "filler_word_count": m.filler_word_count,
        "filler_words": m.filler_words_json,
        "energy_score": m.energy_score,
    }


def _technical_dict(t):
    if not t:
        return None
    return {
        "correctness": t.correctness, "depth": t.depth, "clarity": t.clarity,
        "examples": t.examples, "reasoning": t.reasoning,
        "star_detected": t.star_detected, "feedback": t.feedback,
    }


def _communication_dict(c):
    if not c:
        return None
    return {
        "grammar": c.grammar, "clarity": c.clarity, "conciseness": c.conciseness,
        "professionalism": c.professionalism, "feedback": c.feedback,
    }
