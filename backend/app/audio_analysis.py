"""
Module 4: Audio Intelligence
Technology: Librosa (+ Whisper word timestamps from the Transcript Engine).

Computes:
- Speaking speed (WPM)              -> from whisper word count / duration
- Pause detection (count + total)   -> librosa silence-interval detection
- Filler word detection             -> matched against transcript words w/ timestamps
- Voice energy (0-1 normalized)     -> RMS volume + pitch variation via librosa
"""
import numpy as np
import librosa

FILLER_WORDS = {"um", "uh", "like", "actually", "basically", "you know", "sort of", "kind of", "literally", "i mean"}

MIN_SILENCE_SEC = 0.6  # a gap longer than this counts as a "pause"
LONG_PAUSE_SEC = 2.0   # a gap longer than this is a "long pause" replay event


def detect_filler_words(words: list[dict]) -> list[dict]:
    """words: [{"word": "um", "start": 1.2, "end": 1.4}, ...] from Whisper word timestamps."""
    found = []
    for w in words:
        token = str(w.get("word", "")).strip().lower().strip(".,!?")
        if token in FILLER_WORDS:
            found.append({"word": token, "timestamp": round(float(w.get("start", 0.0)), 2)})
    return found


def detect_pauses(words: list[dict], total_duration: float) -> tuple[int, float, list[float]]:
    """Infer pauses from the gaps between consecutive Whisper word timestamps."""
    if not words or len(words) < 2:
        return 0, 0.0, []

    pause_count = 0
    pause_total = 0.0
    long_pause_timestamps = []

    for i in range(1, len(words)):
        gap = float(words[i].get("start", 0.0)) - float(words[i - 1].get("end", 0.0))
        if gap >= MIN_SILENCE_SEC:
            pause_count += 1
            pause_total += gap
            if gap >= LONG_PAUSE_SEC:
                long_pause_timestamps.append(round(float(words[i - 1].get("end", 0.0)), 2))

    return pause_count, round(pause_total, 2), long_pause_timestamps


def compute_speaking_speed(word_count: int, duration_sec: float) -> float:
    if duration_sec <= 0:
        return 0.0
    return round((word_count / duration_sec) * 60.0, 1)


def compute_energy_score(file_path: str) -> float:
    """0-1 normalized vocal energy combining RMS loudness and pitch (F0) variation."""
    try:
        y, sr = librosa.load(file_path, sr=16000, mono=True)
        if y.size == 0:
            return 0.0

        rms = librosa.feature.rms(y=y)[0]
        rms_mean = float(np.mean(rms))
        # Typical speech RMS on a normalized [-1,1] waveform is roughly in [0, 0.3]
        rms_norm = float(np.clip(rms_mean / 0.15, 0.0, 1.0))

        f0, voiced_flag, _ = librosa.pyin(
            y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr
        )
        voiced = f0[voiced_flag] if f0 is not None and voiced_flag is not None else np.array([])
        if voiced.size > 1:
            pitch_var = float(np.std(voiced) / (np.mean(voiced) + 1e-6))
            pitch_norm = float(np.clip(pitch_var / 0.5, 0.0, 1.0))
        else:
            pitch_norm = 0.0

        energy = round(0.6 * rms_norm + 0.4 * pitch_norm, 2)
        return float(np.clip(energy, 0.0, 1.0))
    except Exception:
        # Fail soft: a corrupt/very short clip shouldn't crash the request
        return 0.0


def analyze_audio(file_path: str, words: list[dict], duration_sec: float) -> dict:
    word_count = len(words) if words else max(len(file_path) * 0, 0)
    fillers = detect_filler_words(words)
    pause_count, pause_total, long_pauses = detect_pauses(words, duration_sec)
    speed = compute_speaking_speed(len(words), duration_sec)
    energy = compute_energy_score(file_path)

    return {
        "speaking_speed_wpm": speed,
        "pause_count": pause_count,
        "pause_duration_total": pause_total,
        "long_pause_timestamps": long_pauses,
        "filler_word_count": len(fillers),
        "filler_words": fillers,
        "energy_score": energy,
    }
