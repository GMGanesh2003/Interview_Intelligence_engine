"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Question, AnswerResult, VideoMetricSample } from "@/lib/api";
import { useFaceTracking, FaceSample } from "@/lib/useFaceTracking";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

const VIDEO_FLUSH_INTERVAL_MS = 5000;

type Phase = "loading" | "ready" | "recording" | "processing" | "review" | "done";

const CATEGORY_COLORS: Record<string, string> = {
  technical: "text-blue border-blue/30 bg-blue-dim",
  behavioral: "text-purple border-purple/30 bg-purple-dim",
  general: "text-signal border-signal/30 bg-signal-dim",
};

// ── Audio guide using Web Speech API ─────────────────────────────────────────
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // stop any ongoing speech
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1;
  utter.volume = 1;
  // Prefer an English voice
  const voices = window.speechSynthesis.getVoices();
  const eng = voices.find((v) => v.lang.startsWith("en"));
  if (eng) utter.voice = eng;
  window.speechSynthesis.speak(utter);
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);

  // ── CRITICAL: video element is ALWAYS in the DOM (hidden until ready)
  // so that videoRef.current is never null when we assign srcObject
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveSample, setLiveSample] = useState<FaceSample | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isProcessingLong, setIsProcessingLong] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const bufferRef = useRef<VideoMetricSample[]>([]);
  const sessionStartRef = useRef<number>(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useAudioRecorder(stream);

  // ── Assign stream to video element whenever either changes ───────────────
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // ── Initial setup: fetch questions + get media ────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const qs = await api.getQuestions(sessionId);
        if (!active) return;
        setQuestions(qs);

        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: true,
        });
        if (!active) return;
        setStream(media);
        sessionStartRef.current = performance.now();
        setPhase("ready");
        // Audio guide: welcome message
        setTimeout(() => speak(
          "Welcome to your interview session. Read each question carefully, then click Record Answer when you are ready to speak. Click Stop Recording when you are done."
        ), 800);
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : "Could not access camera/microphone";
        setError(msg);
        speak("Camera or microphone access was denied. Please allow access and refresh.");
      }
    })();
    return () => { active = false; };
  }, [sessionId]);

  // ── Cleanup stream on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      window.speechSynthesis?.cancel();
    };
  }, [stream]);

  // ── Flush video metrics + elapsed timer ─────────────────────────────────
  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.length > 0) {
        const batch = bufferRef.current;
        bufferRef.current = [];
        api.postVideoMetrics(sessionId, batch).catch(() => {});
      }
    }, VIDEO_FLUSH_INTERVAL_MS);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.round((performance.now() - sessionStartRef.current) / 100) / 10);
    }, 500);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [sessionId]);

  const onFaceSample = useCallback((s: FaceSample) => {
    bufferRef.current.push(s);
    setLiveSample(s);
  }, []);

  const tracking = useFaceTracking(videoRef, !!stream, onFaceSample);
  const currentQuestion = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const progress = questions.length
    ? ((currentIndex + (phase === "review" ? 1 : 0)) / questions.length) * 100
    : 0;

  const elapsedMin = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const elapsedSec = String(Math.floor(elapsed % 60)).padStart(2, "0");

  // ── Audio guide per phase ────────────────────────────────────────────────
  useEffect(() => {
    if (!voiceEnabled) return;
    if (phase === "ready" && currentQuestion) {
      speak(`Question ${currentIndex + 1}. ${currentQuestion.text}. Take your time, then click Record Answer.`);
    } else if (phase === "recording") {
      speak("Recording started. Speak your answer clearly.");
    } else if (phase === "processing") {
      speak("Analyzing your answer. Please wait.");
    } else if (phase === "review") {
      speak("Answer analyzed. Review your scores, then click Next Question to continue.");
    }
  }, [phase, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleRecordToggle() {
    if (phase === "ready" || phase === "review") {
      recorder.start();
      setPhase("recording");
      setIsProcessingLong(false);
    } else if (phase === "recording") {
      setPhase("processing");
      const blob = await recorder.stop();
      const offset = (performance.now() - sessionStartRef.current) / 1000;
      const tid = setTimeout(() => setIsProcessingLong(true), 8000);
      try {
        const result = await api.submitAnswer(currentQuestion.id, offset, blob);
        clearTimeout(tid);
        setLastResult(result);
        setPhase("review");
      } catch (e) {
        clearTimeout(tid);
        const msg = e instanceof Error ? e.message : "Failed to analyze answer";
        setError(msg);
        speak("There was an error analyzing your answer. Please try again.");
        setPhase("ready");
      }
    }
  }

  async function handleNext() {
    if (isLast) {
      speak("Great work! Completing your interview. Loading your results.");
      if (stream) stream.getTracks().forEach((t) => t.stop());
      await api.completeSession(sessionId).catch(() => {});
      if (bufferRef.current.length > 0) {
        await api.postVideoMetrics(sessionId, bufferRef.current).catch(() => {});
        bufferRef.current = [];
      }
      router.push(`/results/${sessionId}`);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setLastResult(null);
    setPhase("ready");
  }

  // ── Error screen ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        {/* video always in DOM (hidden) even on error so ref is never null */}
        <video ref={videoRef} autoPlay muted playsInline className="hidden" />
        <div className="glass-card p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-alert-dim border border-alert/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold mb-2">Session Error</h2>
          <p className="text-alert font-mono text-sm mb-2 leading-relaxed">{error}</p>
          <p className="text-muted text-xs mb-6">Make sure you clicked <strong>Allow</strong> when the browser asked for camera and microphone access.</p>
          <button onClick={() => router.push("/")} className="px-4 py-2 rounded-lg border border-line text-sm text-foreground hover:border-signal/30 hover:bg-signal-dim transition-all">
            ← Back to start
          </button>
        </div>
      </main>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <main className="flex-1 flex flex-col relative overflow-hidden">
      <div className="bg-grid" />
      <div className="orb orb-teal" style={{ opacity: 0.5 }} />

      {/* ── ALWAYS render video (hidden during loading so ref is available) */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="hidden"
        aria-hidden="true"
      />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Header bar */}
        <div className="border-b border-line/60 px-4 sm:px-6 py-3" style={{ background: "rgba(5,7,9,0.6)", backdropFilter: "blur(16px)" }}>
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <div className="flex items-center gap-2 font-mono text-xs text-muted">
              {phase === "recording" ? <span className="rec-dot" /> : <span className="w-2 h-2 rounded-full bg-line" />}
              <span className="tabular-nums">{elapsedMin}:{elapsedSec}</span>
            </div>
            <div className="flex-1 flex items-center gap-3">
              <div className="progress-bar flex-1">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-mono text-muted shrink-0">
                {currentIndex + 1} / {questions.length || "—"}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full border ${tracking.ready ? "border-signal/30 text-signal bg-signal-dim" : "border-line text-muted"}`}>
              {tracking.ready ? <span className="signal-dot" style={{ width: 5, height: 5 }} /> : <span className="w-1.5 h-1.5 rounded-full bg-muted-dim" />}
              {tracking.ready ? "TRACKING" : "LOADING AI"}
            </div>
            {/* Voice toggle */}
            <button
              onClick={() => { setVoiceEnabled(v => !v); window.speechSynthesis?.cancel(); }}
              title={voiceEnabled ? "Mute voice guide" : "Enable voice guide"}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-all ${voiceEnabled ? "border-signal/30 text-signal bg-signal-dim" : "border-line text-muted"}`}
            >
              {voiceEnabled ? "🔊 VOICE ON" : "🔇 VOICE OFF"}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
          {phase === "loading" ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 border-2 border-signal border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="font-display font-bold text-lg">Preparing your session</p>
                  <p className="text-muted text-sm mt-1 font-mono">Requesting camera &amp; microphone…</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col xl:flex-row gap-6 flex-1">
              {/* Left: camera + question */}
              <div className="flex-1 flex flex-col gap-5">
                {/* Question header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold leading-tight">
                      Question {currentIndex + 1}
                    </h1>
                    {currentQuestion && (
                      <span className={`inline-flex mt-1.5 items-center text-[10px] font-mono px-2.5 py-1 rounded-full border ${CATEGORY_COLORS[currentQuestion.category] || CATEGORY_COLORS.general}`}>
                        {currentQuestion.category.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {isLast && <span className="text-[10px] font-mono text-warn bg-warn-dim border border-warn/20 px-2.5 py-1 rounded-full">FINAL QUESTION</span>}
                </div>

                {/* Live camera feed */}
                <div
                  className="relative aspect-video bg-black rounded-xl overflow-hidden border border-line/60"
                  style={{
                    boxShadow: phase === "recording"
                      ? "0 0 0 2px var(--alert), 0 0 24px rgba(255,77,109,0.2)"
                      : "0 0 0 1px rgba(255,255,255,0.04)",
                  }}
                >
                  {/* Mirror the hidden video into this visible element */}
                  <LiveCameraView videoRef={videoRef} />

                  {/* Recording badge */}
                  {phase === "recording" && (
                    <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-alert/40">
                      <span className="rec-dot" />
                      <span className="text-alert font-mono text-[10px] font-bold">REC</span>
                    </div>
                  )}

                  {/* Processing overlay */}
                  {phase === "processing" && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(5,7,9,0.75)", backdropFilter: "blur(6px)" }}>
                      <div className="flex flex-col items-center gap-3 text-center px-6">
                        <div className="w-10 h-10 border-2 border-signal border-t-transparent rounded-full animate-spin" />
                        <p className="font-display font-bold">Analyzing your answer…</p>
                        {isProcessingLong && (
                          <p className="text-muted text-xs max-w-xs leading-relaxed animate-pulse">
                            Running AI analysis on technical depth, communication quality, and vocal energy. This may take a moment…
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Eye contact overlay */}
                  {liveSample && phase !== "processing" && (
                    <div className="absolute bottom-3 left-3 flex gap-2 font-mono text-[10px]">
                      <span className={`px-2 py-1 rounded-md border backdrop-blur-sm ${liveSample.eye_contact ? "border-signal/40 text-signal bg-black/60" : "border-alert/40 text-alert bg-black/60"}`}>
                        {liveSample.eye_contact ? "👁 Eye contact ✓" : "👁 Look at camera"}
                      </span>
                      {!liveSample.face_visible && (
                        <span className="px-2 py-1 rounded-md border border-warn/40 text-warn bg-black/60">
                          ⚠ Face not detected
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Question text card */}
                <div className="glass-card p-5">
                  <p className="text-base sm:text-lg leading-relaxed font-medium">
                    {currentQuestion?.text || "Loading question…"}
                  </p>
                </div>

                {/* Audio guide instruction banner */}
                <GuideBar phase={phase} isLast={isLast} currentQuestion={currentQuestion} />

                {/* Action buttons */}
                <div className="flex gap-3">
                  {phase === "ready" && (
                    <button
                      id="record-toggle-btn"
                      onClick={handleRecordToggle}
                      disabled={!currentQuestion}
                      className="flex-1 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #00f5c8, #38bdf8)", color: "#050709", boxShadow: "0 0 24px rgba(0,245,200,0.3)" }}
                    >
                      <span className="text-lg">🎙</span> Record Answer
                    </button>
                  )}
                  {phase === "recording" && (
                    <button
                      id="stop-recording-btn"
                      onClick={handleRecordToggle}
                      className="flex-1 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                      style={{ background: "var(--alert)", color: "white", boxShadow: "0 0 24px rgba(255,77,109,0.4)" }}
                    >
                      <span className="rec-dot" style={{ width: 9, height: 9 }} />
                      Stop Recording
                    </button>
                  )}
                  {phase === "review" && (
                    <>
                      <button
                        id="re-record-btn"
                        onClick={() => setPhase("ready")}
                        className="px-5 py-4 rounded-xl font-semibold text-sm border border-line text-muted hover:border-line/80 hover:text-foreground transition-all"
                      >
                        ↺ Re-record
                      </button>
                      <button
                        id="next-question-btn"
                        onClick={handleNext}
                        className="flex-1 py-4 rounded-xl font-bold text-sm border border-signal/30 text-signal bg-signal-dim hover:bg-signal/10 transition-all"
                      >
                        {isLast ? "✓ Finish — See results" : "Next question →"}
                      </button>
                    </>
                  )}
                  {phase === "processing" && (
                    <div className="flex-1 py-4 rounded-xl font-semibold text-sm border border-line text-muted flex items-center justify-center gap-3 cursor-not-allowed">
                      <div className="w-4 h-4 border-2 border-signal border-t-transparent rounded-full animate-spin" />
                      Analyzing…
                    </div>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="w-full xl:w-72 shrink-0 flex flex-col gap-4">
                {/* Live telemetry */}
                <div className="glass-card p-5 space-y-4">
                  <p className="font-mono text-[10px] text-muted tracking-wider uppercase">Live Telemetry</p>
                  <TelemetryRow label="Head Stability" value={1 - (liveSample?.head_movement ?? 0)} color="signal" />
                  <TelemetryRow label="Posture Score" value={liveSample?.posture_score ?? 0} color="blue" />
                  <TelemetryRow label="Eye Contact" value={liveSample?.eye_contact ? 1 : 0} color="purple" boolean />
                  <div className="pt-3 border-t border-line">
                    <p className="text-[11px] text-muted leading-relaxed">
                      Sampled every second &amp; sent in 5-second batches to the benchmark engine.
                    </p>
                  </div>
                </div>

                {/* Question list */}
                <div className="glass-card p-5 space-y-1">
                  <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-3">Questions</p>
                  {questions.length === 0
                    ? [...Array(3)].map((_, i) => <div key={i} className="shimmer h-8 rounded-md" />)
                    : questions.map((q, i) => (
                        <div
                          key={q.id}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-md text-xs transition-all cursor-default ${
                            i === currentIndex
                              ? "bg-signal-dim border border-signal/20 text-signal"
                              : i < currentIndex
                              ? "text-muted/50"
                              : "text-muted"
                          }`}
                        >
                          <span className={`font-mono font-bold shrink-0 mt-0.5 ${i === currentIndex ? "text-signal" : i < currentIndex ? "text-signal/30" : ""}`}>
                            {i < currentIndex ? "✓" : String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="line-clamp-2 leading-relaxed">{q.text}</span>
                        </div>
                      ))}
                </div>

                {/* Score preview after review */}
                {lastResult && phase === "review" && (
                  <div className="glass-card p-5 space-y-3 fade-up">
                    <p className="font-mono text-[10px] text-muted tracking-wider uppercase">Just scored</p>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniScore
                        label="Technical"
                        value={Math.round(
                          ((lastResult.technical_score?.correctness ?? 0) +
                            (lastResult.technical_score?.depth ?? 0) +
                            (lastResult.technical_score?.clarity ?? 0)) / 3 * 10
                        )}
                      />
                      <MiniScore
                        label="Communication"
                        value={Math.round(
                          ((lastResult.communication_score?.grammar ?? 0) +
                            (lastResult.communication_score?.clarity ?? 0) +
                            (lastResult.communication_score?.professionalism ?? 0)) / 3 * 10
                        )}
                      />
                    </div>
                    {lastResult.technical_score?.feedback && (
                      <p className="text-[11px] text-muted leading-relaxed border-t border-line pt-3 line-clamp-3">
                        {lastResult.technical_score.feedback}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── LiveCameraView: clones stream from hidden video ref ──────────────────────
// This renders a visible <video> that mirrors the same stream as the hidden ref
function LiveCameraView({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const visibleRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    function sync() {
      if (visibleRef.current && videoRef.current?.srcObject) {
        visibleRef.current.srcObject = videoRef.current.srcObject;
      }
    }
    sync();
    // Poll briefly until the stream appears (it may take a moment after component mounts)
    const t = setInterval(sync, 300);
    setTimeout(() => clearInterval(t), 5000);
    return () => clearInterval(t);
  }, [videoRef]);

  return (
    <video
      ref={visibleRef}
      autoPlay
      muted
      playsInline
      className="w-full h-full object-cover"
      style={{ transform: "scaleX(-1)" }}
    />
  );
}

// ── Guide bar: contextual step-by-step instructions ──────────────────────────
function GuideBar({ phase, isLast, currentQuestion }: { phase: Phase; isLast: boolean; currentQuestion?: Question }) {
  const guides: Record<Phase, { icon: string; text: string; color: string }> = {
    loading:    { icon: "⏳", text: "Setting up your session…", color: "border-line text-muted" },
    ready:      { icon: "📖", text: "Read the question above carefully, then click 🎙 Record Answer when you're ready to speak.", color: "border-signal/20 bg-signal-dim text-signal/90" },
    recording:  { icon: "🎙", text: "You're recording! Speak clearly and directly. Click Stop Recording when you're done.", color: "border-alert/30 bg-alert-dim text-alert" },
    processing: { icon: "🧠", text: "AI is analyzing your response. Please wait…", color: "border-purple/20 bg-purple-dim text-purple" },
    review:     { icon: "📊", text: isLast ? "Great job! Review your score then click Finish to see your full results." : "Answer scored! Review below, then click Next Question to continue.", color: "border-blue/20 bg-blue-dim text-blue" },
    done:       { icon: "✅", text: "Interview complete! Redirecting to your results…", color: "border-signal/20 bg-signal-dim text-signal" },
  };
  const g = guides[phase];
  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm transition-all duration-300 ${g.color}`}>
      <span className="text-base shrink-0 mt-0.5">{g.icon}</span>
      <span className="leading-relaxed">{g.text}</span>
    </div>
  );
}

// ── TelemetryRow ─────────────────────────────────────────────────────────────
function TelemetryRow({ label, value, color, boolean: isBool }: { label: string; value: number; color: string; boolean?: boolean }) {
  const pct = isBool ? (value ? 100 : 0) : Math.min(100, Math.round(value * 100));
  const colorMap: Record<string, string> = {
    signal: "var(--signal)", blue: "var(--blue)", purple: "var(--purple)",
  };
  return (
    <div>
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium" style={{ color: colorMap[color] }}>{pct}%</span>
      </div>
      <div className="telemetry-bar">
        <div
          className="telemetry-bar-fill"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${colorMap[color]}, ${colorMap[color]}88)` }}
        />
      </div>
    </div>
  );
}

// ── MiniScore ────────────────────────────────────────────────────────────────
function MiniScore({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "var(--signal)" : value >= 50 ? "var(--warn)" : "var(--alert)";
  return (
    <div className="flex flex-col items-center p-2.5 rounded-lg border border-line bg-panel-raised">
      <span className="font-display font-bold text-xl" style={{ color }}>{value}</span>
      <span className="text-[9px] font-mono text-muted mt-0.5 tracking-wider">{label.toUpperCase()}</span>
    </div>
  );
}
