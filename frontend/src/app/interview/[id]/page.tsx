"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Question, AnswerResult, VideoMetricSample } from "@/lib/api";
import { useFaceTracking, FaceSample } from "@/lib/useFaceTracking";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

const VIDEO_FLUSH_INTERVAL_MS = 5000;
const FACE_MISSING_ALERT_SEC = 3; // warn if face gone for 3+ seconds during recording

type Phase = "loading" | "ready" | "recording" | "processing" | "review" | "done";

const CATEGORY_COLORS: Record<string, string> = {
  technical:  "text-blue border-blue/30 bg-blue-dim",
  behavioral: "text-purple border-purple/30 bg-purple-dim",
  general:    "text-signal border-signal/30 bg-signal-dim",
};

// ── Web Speech API voice guide ───────────────────────────────────────────────
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95; utter.pitch = 1; utter.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const eng = voices.find((v) => v.lang.startsWith("en"));
  if (eng) utter.voice = eng;
  window.speechSynthesis.speak(utter);
}

export default function InterviewPage() {
  const params  = useParams();
  const router  = useRouter();
  const sessionId = Number(params.id);

  // ── Single video ref used by BOTH tracking AND display ───────────────────
  const videoRef = useRef<HTMLVideoElement>(null);

  const [stream,           setStream]           = useState<MediaStream | null>(null);
  const [questions,        setQuestions]        = useState<Question[]>([]);
  const [currentIndex,     setCurrentIndex]     = useState(0);
  const [phase,            setPhase]            = useState<Phase>("loading");
  const [lastResult,       setLastResult]       = useState<AnswerResult | null>(null);
  const [error,            setError]            = useState<string | null>(null);
  const [liveSample,       setLiveSample]       = useState<FaceSample | null>(null);
  const [elapsed,          setElapsed]          = useState(0);
  const [isProcessingLong, setIsProcessingLong] = useState(false);
  const [voiceEnabled,     setVoiceEnabled]     = useState(true);

  // Cheating / attention detection
  const [faceGoneAlert,   setFaceGoneAlert]   = useState(false);
  const [lookAwayAlert,   setLookAwayAlert]   = useState(false);
  const faceGoneSecRef = useRef(0); // consecutive seconds face not visible
  const lookAwaySecs   = useRef(0); // consecutive seconds looking away while recording

  const bufferRef       = useRef<VideoMetricSample[]>([]);
  const sessionStartRef = useRef<number>(0);
  const flushTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef        = useRef<Phase>("loading"); // mirror of phase for callbacks

  const recorder = useAudioRecorder(stream);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Assign stream to video element once both are ready ────────────────────
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // ── Initial setup ─────────────────────────────────────────────────────────
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
        setTimeout(() => speak(
          "Welcome to your interview. Read each question, then click Record Answer. Speak clearly and look at the camera."
        ), 800);
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : "Could not access camera or microphone";
        setError(msg);
        speak("Camera or microphone access was denied. Please allow access and refresh the page.");
      }
    })();
    return () => { active = false; };
  }, [sessionId]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      window.speechSynthesis?.cancel();
    };
  }, [stream]);

  // ── Timers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.length > 0) {
        const batch = bufferRef.current; bufferRef.current = [];
        api.postVideoMetrics(sessionId, batch).catch(() => {});
      }
    }, VIDEO_FLUSH_INTERVAL_MS);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.round((performance.now() - sessionStartRef.current) / 100) / 10);
    }, 500);
    return () => {
      if (flushTimerRef.current)   clearInterval(flushTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [sessionId]);

  // ── Face sample handler (cheating/attention detection) ────────────────────
  const onFaceSample = useCallback((s: FaceSample) => {
    bufferRef.current.push(s);
    setLiveSample(s);

    const isRecording = phaseRef.current === "recording";

    // Face completely gone
    if (!s.face_visible) {
      faceGoneSecRef.current += 1;
      if (faceGoneSecRef.current >= FACE_MISSING_ALERT_SEC && isRecording) {
        setFaceGoneAlert(true);
        speak("Please keep your face visible to the camera.");
      }
    } else {
      faceGoneSecRef.current = 0;
      setFaceGoneAlert(false);
    }

    // Looking away (no eye contact)
    if (s.face_visible && !s.eye_contact && isRecording) {
      lookAwaySecs.current += 1;
      if (lookAwaySecs.current >= 4) {
        setLookAwayAlert(true);
        speak("Please look at the camera.");
        lookAwaySecs.current = 0; // reset after each reminder
      }
    } else {
      lookAwaySecs.current = 0;
      setLookAwayAlert(false);
    }
  }, []);

  const tracking = useFaceTracking(videoRef, !!stream, onFaceSample);

  const currentQuestion = questions[currentIndex];
  const isLast          = currentIndex === questions.length - 1;
  const progress        = questions.length
    ? ((currentIndex + (phase === "review" ? 1 : 0)) / questions.length) * 100 : 0;

  const elapsedMin = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const elapsedSec = String(Math.floor(elapsed % 60)).padStart(2, "0");

  // ── Voice guide per phase ─────────────────────────────────────────────────
  useEffect(() => {
    if (!voiceEnabled) return;
    if (phase === "ready" && currentQuestion) {
      speak(`Question ${currentIndex + 1}. ${currentQuestion.text}. Take your time, then click Record Answer when ready.`);
    } else if (phase === "recording") {
      speak("Recording started. Speak your answer clearly and look at the camera.");
    } else if (phase === "processing") {
      speak("Analyzing your answer. Please wait.");
    } else if (phase === "review") {
      speak("Answer scored. Review your performance, then click Next Question to continue.");
    }
  }, [phase, currentIndex]); // eslint-disable-line

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleRecordToggle() {
    if (phase === "ready" || phase === "review") {
      recorder.start();
      setPhase("recording");
      setIsProcessingLong(false);
      setFaceGoneAlert(false);
      setLookAwayAlert(false);
      faceGoneSecRef.current = 0;
      lookAwaySecs.current   = 0;
    } else if (phase === "recording") {
      setPhase("processing");
      const blob   = await recorder.stop();
      const offset = (performance.now() - sessionStartRef.current) / 1000;
      const tid    = setTimeout(() => setIsProcessingLong(true), 8000);
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
      speak("Great work. Loading your full results.");
      stream?.getTracks().forEach((t) => t.stop());
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

  // ── Error screen ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-alert-dim border border-alert/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold mb-2">Session Error</h2>
          <p className="text-alert font-mono text-sm mb-2 leading-relaxed">{error}</p>
          <p className="text-muted text-xs mb-6">Make sure you clicked <strong>Allow</strong> when the browser asked for camera and microphone access.</p>
          <button onClick={() => router.push("/")} className="px-4 py-2 rounded-lg border border-line text-sm hover:border-signal/30 hover:bg-signal-dim transition-all">
            ← Back to start
          </button>
        </div>
      </main>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 flex flex-col relative overflow-hidden">
      <div className="bg-grid" />
      <div className="orb orb-teal" style={{ opacity: 0.5 }} />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-line/60 px-4 sm:px-6 py-3"
          style={{ background: "rgba(5,7,9,0.6)", backdropFilter: "blur(16px)" }}>
          <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 font-mono text-xs text-muted">
              {phase === "recording" ? <span className="rec-dot" /> : <span className="w-2 h-2 rounded-full bg-line" />}
              <span className="tabular-nums">{elapsedMin}:{elapsedSec}</span>
            </div>
            <div className="flex-1 flex items-center gap-3 min-w-[120px]">
              <div className="progress-bar flex-1">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-mono text-muted shrink-0">
                {currentIndex + 1} / {questions.length || "—"}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full border ${tracking.ready ? "border-signal/30 text-signal bg-signal-dim" : "border-line text-muted"}`}>
              {tracking.ready ? <span className="signal-dot" style={{ width: 5, height: 5 }} /> : <span className="w-1.5 h-1.5 rounded-full bg-muted-dim" />}
              {tracking.ready ? "AI TRACKING" : "LOADING AI"}
            </div>
            <button
              onClick={() => { setVoiceEnabled(v => !v); window.speechSynthesis?.cancel(); }}
              className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-all ${voiceEnabled ? "border-signal/30 text-signal bg-signal-dim" : "border-line text-muted"}`}
            >
              {voiceEnabled ? "🔊 VOICE" : "🔇 MUTED"}
            </button>
          </div>
        </div>

        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-5">
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
              {/* ── Left: camera + question ─────────────────────────────── */}
              <div className="flex-1 flex flex-col gap-4">
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
                  {isLast && <span className="text-[10px] font-mono text-warn bg-warn-dim border border-warn/20 px-2.5 py-1 rounded-full shrink-0">FINAL QUESTION</span>}
                </div>

                {/* ── Camera feed (single video element, always visible) ── */}
                <div
                  className="relative aspect-video bg-[#050709] rounded-xl overflow-hidden border"
                  style={{
                    borderColor: phase === "recording" ? "var(--alert)" : "rgba(255,255,255,0.06)",
                    boxShadow:   phase === "recording" ? "0 0 0 1px var(--alert), 0 0 32px rgba(255,77,109,0.2)" : "none",
                  }}
                >
                  {/* THE camera video — ref shared with face tracking */}
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />

                  {/* Recording badge */}
                  {phase === "recording" && (
                    <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-sm border border-alert/50">
                      <span className="rec-dot" />
                      <span className="text-alert font-mono text-[10px] font-bold tracking-wider">RECORDING</span>
                    </div>
                  )}

                  {/* Processing overlay */}
                  {phase === "processing" && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(5,7,9,0.8)", backdropFilter: "blur(8px)" }}>
                      <div className="flex flex-col items-center gap-3 text-center px-8">
                        <div className="w-10 h-10 border-2 border-signal border-t-transparent rounded-full animate-spin" />
                        <p className="font-display font-bold text-lg">Analyzing your answer…</p>
                        {isProcessingLong && (
                          <p className="text-muted text-xs max-w-xs leading-relaxed animate-pulse">
                            AI is scoring technical depth, communication quality, and vocal energy. This takes a moment…
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Face / eye tracking overlays */}
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 font-mono text-[10px]">
                    {liveSample && phase !== "processing" && (
                      <>
                        <span className={`px-2 py-1 rounded-md border backdrop-blur-sm ${liveSample.eye_contact ? "border-signal/50 text-signal bg-black/70" : "border-warn/50 text-warn bg-black/70"}`}>
                          {liveSample.eye_contact ? "👁 Eye contact ✓" : "👁 Look at camera"}
                        </span>
                        {!liveSample.face_visible && (
                          <span className="px-2 py-1 rounded-md border border-alert/60 text-alert bg-black/70">
                            ⚠ Face not visible
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Cheating alerts */}
                  {faceGoneAlert && phase === "recording" && (
                    <div className="absolute top-12 left-3 right-3 mx-auto max-w-sm">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-alert/90 text-white text-xs font-bold animate-pulse">
                        ⚠️ Keep your face visible — interview is being monitored
                      </div>
                    </div>
                  )}
                  {lookAwayAlert && phase === "recording" && (
                    <div className="absolute top-12 left-3 right-3 mx-auto max-w-sm">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warn/90 text-[#050709] text-xs font-bold">
                        📷 Please look directly at the camera
                      </div>
                    </div>
                  )}
                </div>

                {/* Question text */}
                <div className="glass-card p-5">
                  <p className="text-base sm:text-lg leading-relaxed font-medium">
                    {currentQuestion?.text || "Loading question…"}
                  </p>
                </div>

                {/* Context guide banner */}
                <GuideBar phase={phase} isLast={isLast} />

                {/* Action buttons */}
                <div className="flex gap-3">
                  {phase === "ready" && (
                    <button id="record-btn" onClick={handleRecordToggle} disabled={!currentQuestion}
                      className="flex-1 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #00f5c8, #38bdf8)", color: "#050709", boxShadow: "0 0 28px rgba(0,245,200,0.25)" }}>
                      <span className="text-lg">🎙</span> Record Answer
                    </button>
                  )}
                  {phase === "recording" && (
                    <button id="stop-btn" onClick={handleRecordToggle}
                      className="flex-1 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                      style={{ background: "var(--alert)", color: "white", boxShadow: "0 0 28px rgba(255,77,109,0.3)" }}>
                      <span className="rec-dot" style={{ width: 9, height: 9 }} /> Stop Recording
                    </button>
                  )}
                  {phase === "review" && (
                    <>
                      <button id="rerecord-btn" onClick={() => { setLastResult(null); setPhase("ready"); }}
                        className="px-5 py-4 rounded-xl font-semibold text-sm border border-line text-muted hover:text-foreground transition-all">
                        ↺ Re-record
                      </button>
                      <button id="next-btn" onClick={handleNext}
                        className="flex-1 py-4 rounded-xl font-bold text-sm border border-signal/40 text-signal bg-signal-dim hover:bg-signal/10 transition-all">
                        {isLast ? "✓ Finish — See results" : "Next question →"}
                      </button>
                    </>
                  )}
                  {phase === "processing" && (
                    <div className="flex-1 py-4 rounded-xl text-sm border border-line text-muted flex items-center justify-center gap-3 cursor-not-allowed">
                      <div className="w-4 h-4 border-2 border-signal border-t-transparent rounded-full animate-spin" /> AI is analyzing…
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right sidebar ───────────────────────────────────────── */}
              <div className="w-full xl:w-72 shrink-0 flex flex-col gap-4">
                {/* Live telemetry */}
                <div className="glass-card p-5 space-y-4">
                  <p className="font-mono text-[10px] text-muted tracking-wider uppercase">Live Telemetry</p>
                  <TelemetryRow label="Head Stability"  value={1 - (liveSample?.head_movement ?? 0)} color="signal" />
                  <TelemetryRow label="Posture Score"   value={liveSample?.posture_score ?? 0}        color="blue"   />
                  <TelemetryRow label="Eye Contact"     value={liveSample?.eye_contact ? 1 : 0}       color="purple" boolean />
                  <div className="pt-3 border-t border-line text-[11px] text-muted leading-relaxed">
                    Face &amp; posture tracked every second. Results impact your Confidence score.
                  </div>
                </div>

                {/* Question list */}
                <div className="glass-card p-5 space-y-1">
                  <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-3">All Questions</p>
                  {questions.length === 0
                    ? [...Array(3)].map((_, i) => <div key={i} className="shimmer h-8 rounded-md mb-1" />)
                    : questions.map((q, i) => (
                      <div key={q.id} className={`flex items-start gap-2.5 px-3 py-2 rounded-md text-xs transition-all ${
                        i === currentIndex ? "bg-signal-dim border border-signal/20 text-signal"
                        : i < currentIndex ? "text-muted/40" : "text-muted"}`}>
                        <span className={`font-mono font-bold shrink-0 mt-0.5 ${i === currentIndex ? "text-signal" : i < currentIndex ? "text-signal/30" : ""}`}>
                          {i < currentIndex ? "✓" : String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="line-clamp-2 leading-relaxed">{q.text}</span>
                      </div>
                    ))}
                </div>

                {/* Score + filler words after review */}
                {lastResult && phase === "review" && (
                  <div className="glass-card p-5 space-y-4 fade-up">
                    <p className="font-mono text-[10px] text-muted tracking-wider uppercase">Answer Breakdown</p>

                    {/* Score grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <MiniScore label="Technical"     value={Math.round(((lastResult.technical_score?.correctness ?? 0) + (lastResult.technical_score?.depth ?? 0) + (lastResult.technical_score?.clarity ?? 0)) / 3 * 10)} />
                      <MiniScore label="Communication" value={Math.round(((lastResult.communication_score?.grammar ?? 0) + (lastResult.communication_score?.clarity ?? 0) + (lastResult.communication_score?.professionalism ?? 0)) / 3 * 10)} />
                    </div>

                    {/* Filler words */}
                    {lastResult.audio_metrics?.filler_word_count > 0 && (
                      <div className="pt-3 border-t border-line space-y-2">
                        <p className="text-[10px] font-mono text-warn tracking-wider uppercase">
                          Filler Words ({lastResult.audio_metrics.filler_word_count})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {lastResult.audio_metrics.filler_words.map((fw: any, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-warn-dim border border-warn/30 text-warn">
                              "{fw.word}" @{fw.timestamp}s
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted leading-relaxed">
                          Try pausing silently instead of saying "{lastResult.audio_metrics.filler_words[0]?.word}".
                        </p>
                      </div>
                    )}
                    {lastResult.audio_metrics?.filler_word_count === 0 && (
                      <div className="pt-2 border-t border-line">
                        <p className="text-[10px] text-signal font-mono">✓ No filler words detected</p>
                      </div>
                    )}

                    {/* Speaking speed */}
                    <div className="flex items-center justify-between text-[11px] border-t border-line pt-3">
                      <span className="text-muted">Speaking pace</span>
                      <span className="font-mono font-bold text-foreground">
                        {Math.round(lastResult.audio_metrics?.speaking_speed_wpm ?? 0)} WPM
                        {(lastResult.audio_metrics?.speaking_speed_wpm ?? 0) > 160
                          ? " ⚠ fast" : (lastResult.audio_metrics?.speaking_speed_wpm ?? 0) < 100
                          ? " ⚠ slow" : " ✓"}
                      </span>
                    </div>

                    {/* Technical feedback */}
                    {lastResult.technical_score?.feedback && (
                      <div className="border-t border-line pt-3">
                        <p className="text-[10px] text-muted font-mono mb-1 tracking-wider">AI FEEDBACK</p>
                        <p className="text-[11px] text-muted leading-relaxed line-clamp-4">
                          {lastResult.technical_score.feedback}
                        </p>
                      </div>
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

// ── GuideBar ─────────────────────────────────────────────────────────────────
function GuideBar({ phase, isLast }: { phase: Phase; isLast: boolean }) {
  const guides: Record<Phase, { icon: string; text: string; cls: string }> = {
    loading:    { icon: "⏳", text: "Setting up your session…",                                                                                  cls: "border-line text-muted bg-panel" },
    ready:      { icon: "📖", text: "Read the question above, then click 🎙 Record Answer when you're ready to speak.",                           cls: "border-signal/20 bg-signal-dim text-signal/90" },
    recording:  { icon: "🎙", text: "Speak clearly. Look at the camera. Click Stop Recording when done.",                                        cls: "border-alert/30 bg-alert-dim text-alert" },
    processing: { icon: "🧠", text: "AI is scoring your answer — technical depth, communication, filler words, vocal energy. Please wait…",      cls: "border-purple/20 bg-purple-dim text-purple" },
    review:     { icon: "📊", text: isLast ? "Great work! Review your score, then click Finish to see your full results." : "Answer scored! Review below, then click Next Question.", cls: "border-blue/20 bg-blue-dim text-blue" },
    done:       { icon: "✅", text: "Interview complete! Redirecting…",                                                                           cls: "border-signal/20 bg-signal-dim text-signal" },
  };
  const g = guides[phase];
  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm transition-all duration-300 ${g.cls}`}>
      <span className="text-base shrink-0 mt-0.5">{g.icon}</span>
      <span className="leading-relaxed">{g.text}</span>
    </div>
  );
}

// ── TelemetryRow ─────────────────────────────────────────────────────────────
function TelemetryRow({ label, value, color, boolean: isBool }: { label: string; value: number; color: string; boolean?: boolean }) {
  const pct = isBool ? (value ? 100 : 0) : Math.min(100, Math.round(value * 100));
  const cm: Record<string, string> = { signal: "var(--signal)", blue: "var(--blue)", purple: "var(--purple)" };
  return (
    <div>
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium" style={{ color: cm[color] }}>{pct}%</span>
      </div>
      <div className="telemetry-bar">
        <div className="telemetry-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${cm[color]}, ${cm[color]}88)` }} />
      </div>
    </div>
  );
}

// ── MiniScore ─────────────────────────────────────────────────────────────────
function MiniScore({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "var(--signal)" : value >= 50 ? "var(--warn)" : "var(--alert)";
  return (
    <div className="flex flex-col items-center p-2.5 rounded-lg border border-line bg-panel-raised">
      <span className="font-display font-bold text-xl" style={{ color }}>{value}</span>
      <span className="text-[9px] font-mono text-muted mt-0.5 tracking-wider">{label.toUpperCase()}</span>
    </div>
  );
}
