"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, DashboardResp, BenchmarkResp, ReplayEvent } from "@/lib/api";

const EVENT_STYLES: Record<string, { color: string; variant: "default" | "warn" | "alert" }> = {
  strong_answer: { color: "text-signal", variant: "default" },
  filler_word: { color: "text-warn", variant: "warn" },
  long_pause: { color: "text-warn", variant: "warn" },
  eye_contact_drop: { color: "text-alert", variant: "alert" },
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);

  const [dashboard, setDashboard] = useState<DashboardResp | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResp | null>(null);
  const [replay, setReplay] = useState<ReplayEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, b, r] = await Promise.all([
          api.getDashboard(sessionId),
          api.getBenchmark(sessionId),
          api.getReplay(sessionId),
        ]);
        setDashboard(d);
        setBenchmark(b);
        setReplay(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load results");
      }
    })();
  }, [sessionId]);

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-5 space-y-3">
            <p className="text-alert font-mono text-sm">{error}</p>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to start
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!dashboard || !benchmark) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="font-mono text-sm text-muted">Compiling analytics…</p>
      </main>
    );
  }

  const radarData = [
    { metric: "Eye contact", you: Math.round(benchmark.user.eye_contact * 100), benchmark: Math.round(benchmark.benchmark.eye_contact * 100) },
    { metric: "Technical", you: benchmark.user.technical_score, benchmark: benchmark.benchmark.technical_score },
    { metric: "Communication", you: benchmark.user.communication_score, benchmark: benchmark.benchmark.communication_score },
    { metric: "Energy", you: Math.round(benchmark.user.energy_score * 100), benchmark: Math.round(benchmark.benchmark.energy_score * 100) },
    {
      metric: "Pace control",
      you: Math.max(0, 100 - Math.abs(benchmark.user.speaking_speed - benchmark.benchmark.speaking_speed)),
      benchmark: 100,
    },
  ];

  return (
    <main className="flex-1 flex flex-col">
      <div className="scanline" />
      <div className="max-w-5xl w-full mx-auto px-6 py-10 flex-1 flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-signal tracking-[0.2em]">SESSION #{sessionId} · COMPLETE</p>
            <h1 className="font-display text-3xl font-bold mt-1">Interview scorecard</h1>
          </div>
          <Button variant="outline" onClick={() => router.push("/")}>
            New interview
          </Button>
        </header>

        {/* Top-line scores */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ScoreTile label="Overall score" value={dashboard.overall_score} big />
          <ScoreTile label="Confidence" value={dashboard.confidence_score} />
          <ScoreTile label="Technical depth" value={dashboard.technical_score} />
          <ScoreTile label="Communication" value={dashboard.communication_score} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Eye contact" value={`${dashboard.eye_contact_pct}%`} />
          <StatTile label="Energy" value={`${Math.round(dashboard.energy_score * 100)}%`} />
          <StatTile label="Filler words" value={String(dashboard.filler_word_total)} />
          <StatTile label="Speaking pace" value={`${dashboard.speaking_speed_avg} wpm`} />
        </div>

        <div className="grid md:grid-cols-[1fr_1fr] gap-6">
          {/* Benchmark radar */}
          <Card>
            <CardHeader>
              <CardTitle>Benchmark vs. placed candidates · {benchmark.role}</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#232830" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#8b93a1", fontSize: 11 }} />
                  <Radar name="You" dataKey="you" stroke="#5eead4" fill="#5eead4" fillOpacity={0.25} />
                  <Radar name="Benchmark" dataKey="benchmark" stroke="#8b93a1" fill="#8b93a1" fillOpacity={0.08} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#8b93a1" }} />
                  <Tooltip
                    contentStyle={{ background: "#12151a", border: "1px solid #232830", fontSize: 12 }}
                    labelStyle={{ color: "#e7eaee" }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Replay timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Interview replay</CardTitle>
            </CardHeader>
            <CardContent className="pt-5 max-h-72 overflow-y-auto space-y-2">
              {replay.length === 0 && (
                <p className="text-sm text-muted">No notable moments detected yet.</p>
              )}
              {replay.map((ev, i) => {
                const style = EVENT_STYLES[ev.event_type] ?? { color: "text-muted", variant: "muted" as const };
                return (
                  <div key={i} className="flex items-center gap-3 font-mono text-xs border-b border-line/60 pb-2">
                    <span className="text-muted w-12">{fmtTime(ev.timestamp_sec)}</span>
                    <Badge variant={style.variant}>{ev.event_type.replace(/_/g, " ")}</Badge>
                    <span className={style.color}>{ev.label}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>AI recommendations</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <ul className="space-y-2">
              {dashboard.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-signal">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-foreground/90">{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ScoreTile({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="font-mono text-[10px] text-muted tracking-wider">{label.toUpperCase()}</p>
        <p className={`font-display font-bold mt-1 ${big ? "text-4xl text-signal" : "text-2xl"}`}>
          {Math.round(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="font-mono text-[10px] text-muted tracking-wider">{label.toUpperCase()}</p>
        <p className="font-mono text-lg mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
