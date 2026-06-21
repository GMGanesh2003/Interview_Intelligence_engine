import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

_client: Groq | None = None


def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key or api_key == "your_groq_api_key_here":
            raise RuntimeError(
                "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys "
                "and put it in backend/.env"
            )
        _client = Groq(api_key=api_key)
    return _client


LLM_MODEL = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")


def _chat_json(system_prompt: str, user_prompt: str) -> dict:
    """Call the Groq chat completion endpoint and force a JSON object response."""
    client = get_client()
    resp = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Strip stray markdown fences if the model added them anyway
        cleaned = raw.strip().strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        return json.loads(cleaned)


# ---------------------------------------------------------------------------
# Module 2: Question Generation Engine
# ---------------------------------------------------------------------------
def generate_questions(resume_text: str, role: str, experience: str, num_questions: int = 5) -> list[dict]:
    system_prompt = (
        "You are an expert technical interviewer. Generate realistic mock interview "
        "questions tailored to the candidate's resume, target role, and experience level. "
        "Mix technical, behavioral, and general questions. "
        'Respond ONLY with JSON of the shape: {"questions": [{"text": "...", "category": "technical|behavioral|general"}]}'
    )
    user_prompt = (
        f"Role: {role}\n"
        f"Experience level: {experience}\n"
        f"Resume / background:\n{resume_text}\n\n"
        f"Generate exactly {num_questions} interview questions."
    )
    data = _chat_json(system_prompt, user_prompt)
    return data.get("questions", [])[:num_questions]


# ---------------------------------------------------------------------------
# Module 5: Transcript Engine (Whisper via Groq)
# ---------------------------------------------------------------------------
def transcribe_audio(file_path: str) -> dict:
    """Returns {"text": str, "duration": float, "words": [{"word":.., "start":.., "end":..}]}"""
    client = get_client()
    with open(file_path, "rb") as f:
        transcription = client.audio.transcriptions.create(
            file=(os.path.basename(file_path), f.read()),
            model=WHISPER_MODEL,
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )
    data = transcription.model_dump() if hasattr(transcription, "model_dump") else dict(transcription)
    return {
        "text": data.get("text", ""),
        "duration": data.get("duration", 0.0) or 0.0,
        "words": data.get("words", []) or [],
    }


# ---------------------------------------------------------------------------
# Module 6: Technical Depth Analyzer
# ---------------------------------------------------------------------------
def analyze_technical_depth(question: str, transcript: str, role: str) -> dict:
    system_prompt = (
        "You are a strict technical interview evaluator for the role of " + role + ". "
        "Score the candidate's spoken answer (already transcribed, may contain minor STT errors). "
        "Score each dimension 0-100. Detect whether the answer follows the STAR framework "
        "(Situation, Task, Action, Result) for behavioral-style answers. "
        'Respond ONLY with JSON: {"correctness": int, "depth": int, "clarity": int, "examples": int, '
        '"reasoning": int, "star_detected": {"situation": bool, "task": bool, "action": bool, "result": bool}, '
        '"feedback": "2-3 sentence actionable feedback"}'
    )
    user_prompt = f"Question: {question}\n\nCandidate's answer transcript: {transcript}"
    return _chat_json(system_prompt, user_prompt)


# ---------------------------------------------------------------------------
# Module 7: Communication Analyzer
# ---------------------------------------------------------------------------
def analyze_communication(transcript: str) -> dict:
    system_prompt = (
        "You are a communication coach evaluating a spoken interview answer transcript. "
        "Score each dimension 0-100: grammar, clarity, conciseness, professionalism. "
        'Respond ONLY with JSON: {"grammar": int, "clarity": int, "conciseness": int, '
        '"professionalism": int, "feedback": "2-3 sentence actionable feedback"}'
    )
    return _chat_json(system_prompt, f"Transcript: {transcript}")


# ---------------------------------------------------------------------------
# Dashboard recommendations summary
# ---------------------------------------------------------------------------
def generate_recommendations(summary: dict) -> list[str]:
    system_prompt = (
        "You are an interview coach. Given aggregate performance metrics from a mock interview, "
        'produce 4-6 short, specific, actionable recommendations. Respond ONLY with JSON: '
        '{"recommendations": ["...", "..."]}'
    )
    data = _chat_json(system_prompt, json.dumps(summary))
    return data.get("recommendations", [])
