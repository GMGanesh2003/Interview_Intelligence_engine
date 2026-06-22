export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

/**
 * Auth token cache — avoids calling /api/auth/token on every request.
 * Refreshes when the cached token is within 10 minutes of expiry.
 */
let _cachedToken: string | null = null;
let _tokenExpiry: number = 0; // unix timestamp ms

async function getAuthToken(): Promise<string | null> {
  const now = Date.now();

  // Return cached token if still valid (with 10-min buffer)
  if (_cachedToken && _tokenExpiry - now > 10 * 60 * 1000) {
    return _cachedToken;
  }

  try {
    const res = await fetch("/api/auth/token", { credentials: "include" });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.token) return null;

    // Guest token never expires on our end
    if (data.token === "guest_token_123") {
      _cachedToken = data.token;
      _tokenExpiry = now + 24 * 60 * 60 * 1000; // 24h
      return _cachedToken;
    }

    // Decode expiry from JWT payload (no verification needed here — we just
    // need the exp claim to know when to refresh)
    try {
      const payloadB64 = data.token.split(".")[1];
      const payload = JSON.parse(atob(payloadB64));
      _tokenExpiry = (payload.exp || 0) * 1000; // convert to ms
    } catch {
      _tokenExpiry = now + 90 * 60 * 1000; // fallback: 90 min
    }

    _cachedToken = data.token;
    return _cachedToken;
  } catch {
    return null;
  }
}

async function getAuthHeaders(
  existing: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { ...existing, Authorization: `Bearer ${token}` } : existing;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Question = {
  id: number;
  order_index: number;
  text: string;
  category: string;
};

export type SessionResp = {
  id: number;
  role: string;
  experience: string;
  status: string;
  created_at: string;
};

export type VideoMetricSample = {
  timestamp_sec: number;
  eye_contact: boolean;
  head_movement: number;
  face_visible: boolean;
  posture_score: number;
};

export type AnswerResult = {
  id: number;
  question_id: number;
  transcript: string;
  duration_sec: number;
  audio_metrics: {
    speaking_speed_wpm: number;
    pause_count: number;
    pause_duration_total: number;
    filler_word_count: number;
    filler_words: { word: string; timestamp: number }[];
    energy_score: number;
  };
  technical_score: {
    correctness: number;
    depth: number;
    clarity: number;
    examples: number;
    reasoning: number;
    star_detected: Record<string, boolean>;
    feedback: string;
  };
  communication_score: {
    grammar: number;
    clarity: number;
    conciseness: number;
    professionalism: number;
    feedback: string;
  };
};

export type DashboardResp = {
  session_id: number;
  overall_score: number;
  confidence_score: number;
  communication_score: number;
  technical_score: number;
  eye_contact_pct: number;
  energy_score: number;
  filler_word_total: number;
  speaking_speed_avg: number;
  recommendations: string[];
};

export type BenchmarkResp = {
  role: string;
  user: Record<string, number>;
  benchmark: Record<string, number>;
  gap: Record<string, number>;
};

export type ReplayEvent = {
  timestamp_sec: number;
  event_type: "filler_word" | "eye_contact_drop" | "strong_answer" | "long_pause";
  label: string;
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

// ─── API client ───────────────────────────────────────────────────────────────

export const api = {
  createSession: async (payload: {
    resume_text: string;
    role: string;
    experience: string;
    num_questions: number;
  }) =>
    fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: await getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).then((r) => handle<SessionResp>(r)),

  getQuestions: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/questions`, {
      headers: await getAuthHeaders(),
    }).then((r) => handle<Question[]>(r)),

  postVideoMetrics: async (sessionId: number, metrics: VideoMetricSample[]) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/video-metrics`, {
      method: "POST",
      headers: await getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ metrics }),
    }).then((r) => handle(r)),

  submitAnswer: async (
    questionId: number,
    sessionStartOffset: number,
    audioBlob: Blob
  ) => {
    const form = new FormData();
    form.append("question_id", String(questionId));
    form.append("session_start_offset", String(sessionStartOffset));
    form.append("audio", audioBlob, "answer.webm");
    return fetch(`${API_BASE}/api/answers`, {
      method: "POST",
      body: form,
      headers: await getAuthHeaders(),
    }).then((r) => handle<AnswerResult>(r));
  },

  completeSession: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/complete`, {
      method: "POST",
      headers: await getAuthHeaders(),
    }).then((r) => handle<SessionResp>(r)),

  getDashboard: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/dashboard`, {
      headers: await getAuthHeaders(),
    }).then((r) => handle<DashboardResp>(r)),

  getBenchmark: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/benchmark`, {
      headers: await getAuthHeaders(),
    }).then((r) => handle<BenchmarkResp>(r)),

  getReplay: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/replay`, {
      headers: await getAuthHeaders(),
    }).then((r) => handle<ReplayEvent[]>(r)),
};
