"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api, Question, AnswerResult, VideoMetricSample } from "@/lib/api";
import { useFaceTracking, FaceSample } from "@/lib/useFaceTracking";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

const VIDEO_FLUSH_INTERVAL_MS = 5000;

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "recording" | "processing" | "review" | "done">(
    "loading"
  );
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveSample, setLiveSample] = useState<FaceSample | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isProcessingLong, setIsProcessingLong] = useState(false);

  const bufferRef = useRef<VideoMetricSample[]>([]);
  const sessionStartRef = useRef<number>(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useAudioRecorder(stream);

  // Load questions + request camera/mic
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const qs = await api.getQuestions(sessionId);
        if (!active) return;
        setQuestions(qs);
        const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!active) return;
        setStream(media);
        if (videoRef.current) videoRef.current.srcObject = media;
        sessionStartRef.current = performance.now();
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not access camera/microphone");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  // Flush buffered video metrics to backend periodically
  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.length > 0) {
        const batch = bufferRef.current;
        bufferRef.current = [];
        api.postVideoMetrics(sessionId, batch).catch(() => {
          /* best-effort telemetry, ignore failures */
        });
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

  async function handleRecordToggle() {
    if (phase === "ready" || phase === "review") {
      recorder.start();
      setPhase("recording");
      setIsProcessingLong(false);
    } else if (phase === "recording") {
      setPhase("processing");
      const blob = await recorder.stop();
      const offset = (performance.now() - sessionStartRef.current) / 1000;
      
      const timeoutId = setTimeout(() => setIsProcessingLong(true), 8000);
      
      try {
        const result = await api.submitAnswer(currentQuestion.id, offset, blob);
        clearTimeout(timeoutId);
        setLastResult(result);
        setPhase("review");
      } catch (e) {
        clearTimeout(timeoutId);
        setError(e instanceof Error ? e.message : "Failed to analyze answer");
        setPhase("ready");
      }
    }
  }

  async function handleNext() {
    if (isLast) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
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

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-5">
            <p className="text-alert font-mono text-sm">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => router.push("/")}>
              Back to start
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col">
      <div className="scanline" />
      <div className="max-w-5xl w-full mx-auto px-6 py-10 flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-signal tracking-[0.2em]">
              SESSION #{sessionId} · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
              {String(Math.floor(elapsed % 60)).padStart(2, "0")}
            </p>
            <h1 className="font-display text-2xl font-bold mt-1">
              Question {currentIndex + 1} of {questions.length || "—"}
            </h1>
          </div>
          <Badge variant={tracking.ready ? "default" : "muted"}>
            {tracking.ready ? "Tracking live" : "Loading model…"}
          </Badge>
        </div>

        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          {/* Webcam + question panel */}
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div className="relative aspect-video bg-black rounded-sm overflow-hidden border border-line">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover -scale-x-100"
                />
                {liveSample && (
                  <div className="absolute bottom-2 left-2 flex gap-2 font-mono text-[10px]">
                    <span
                      className={`px-2 py-1 rounded-sm border ${
                        liveSample.eye_contact ? "border-signal text-signal bg-black/60" : "border-alert text-alert bg-black/60"
                      }`}
                    >
                      EYE CONTACT {liveSample.eye_contact ? "OK" : "LOST"}
                    </span>
                    <span className="px-2 py-1 rounded-sm border border-line text-muted bg-black/60">
                      FACE {liveSample.face_visible ? "VISIBLE" : "NOT FOUND"}
                    </span>
                  </div>
                )}
              </div>

              <div className="border border-line rounded-sm p-4 bg-panel-raised">
                <p className="font-mono text-[10px] text-muted mb-2">
                  {currentQuestion?.category?.toUpperCase() || "QUESTION"}
                </p>
                <p className="text-lg">{currentQuestion?.text || "Loading question…"}</p>
              </div>

              {phase === "ready" && (
                <div className="bg-signal/10 border border-signal/20 text-signal text-sm p-3 rounded-sm leading-relaxed">
                  <strong>Instructions:</strong> Please read the question carefully. When you are ready to answer, click <strong>Record answer</strong> and speak clearly. Once you are finished, stop the recording to proceed to the next question.
                </div>
              )}

              <div className="flex gap-3">
                {(phase === "ready" || phase === "recording") && (
                  <Button
                    onClick={handleRecordToggle}
                    variant={phase === "recording" ? "destructive" : "default"}
                    size="lg"
                    className="flex-1"
                    disabled={!currentQuestion}
                  >
                    {phase === "recording" ? "● Stop recording" : "Record answer"}
                  </Button>
                )}
                {phase === "processing" && (
                  <div className="flex-1 flex flex-col gap-2">
                    <Button disabled size="lg" className="w-full">
                      Analyzing answer…
                    </Button>
                    {isProcessingLong && (
                      <p className="text-xs text-muted text-center animate-pulse">
                        This is taking longer than usual. If the free server is waking up, this can take up to 60 seconds. Please wait... (If it gets stuck, refresh the page)
                      </p>
                    )}
                  </div>
                )}
                {phase === "review" && (
                  <Button onClick={handleNext} size="lg" className="flex-1">
                    {isLast ? "Finish interview → see results" : "Next question"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live telemetry sidebar */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              <p className="font-mono text-[10px] text-muted tracking-wider">LIVE TELEMETRY</p>
              <TelemetryRow label="Head movement" value={liveSample?.head_movement ?? 0} />
              <TelemetryRow label="Posture" value={liveSample?.posture_score ?? 0} />
              <div className="pt-3 border-t border-line">
                <p className="text-xs text-muted">
                  Questions are answered one at a time. Video signal is sampled continuously in
                  the background and sent to the Benchmark + Replay engines.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function TelemetryRow({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-foreground/80">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-panel-raised rounded-full overflow-hidden">
        <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
