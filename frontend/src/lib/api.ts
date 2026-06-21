export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
import { getSession } from "next-auth/react";

async function getAuthHeaders(existingHeaders: Record<string, string> = {}) {
  const session = await getSession();
  const token = session ? (session as any).idToken : null;
  return token ? { ...existingHeaders, Authorization: `Bearer ${token}` } : existingHeaders;
}

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

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  createSession: async (payload: { resume_text: string; role: string; experience: string; num_questions: number }) =>
    fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: await getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).then((r) => handle<SessionResp>(r)),

  getQuestions: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/questions`, { headers: await getAuthHeaders() }).then((r) => handle<Question[]>(r)),

  postVideoMetrics: async (sessionId: number, metrics: VideoMetricSample[]) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/video-metrics`, {
      method: "POST",
      headers: await getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ metrics }),
    }).then((r) => handle(r)),

  submitAnswer: async (questionId: number, sessionStartOffset: number, audioBlob: Blob) => {
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
    fetch(`${API_BASE}/api/sessions/${sessionId}/dashboard`, { headers: await getAuthHeaders() }).then((r) => handle<DashboardResp>(r)),

  getBenchmark: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/benchmark`, { headers: await getAuthHeaders() }).then((r) => handle<BenchmarkResp>(r)),

  getReplay: async (sessionId: number) =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/replay`, { headers: await getAuthHeaders() }).then((r) => handle<ReplayEvent[]>(r)),
};
