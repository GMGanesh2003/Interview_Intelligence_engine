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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { api, DashboardResp, BenchmarkResp, ReplayEvent } from "@/lib/api";

const EVENT_CONFIG: Record<string, { label: string; icon: string; colorVar: string; bgClass: string }> = {
  strong_answer:    { label: "Strong Answer",    icon: "✓", colorVar: "var(--signal)", bgClass: "bg-signal-dim border-signal/30 text-signal" },
  filler_word:      { label: "Filler Word",       icon: "⚠", colorVar: "var(--warn)",   bgClass: "bg-warn-dim border-warn/30 text-warn" },
  long_pause:       { label: "Long Pause",        icon: "⏸", colorVar: "var(--warn)",   bgClass: "bg-warn-dim border-warn/30 text-warn" },
  eye_contact_drop: { label: "Eye Contact Drop",  icon: "👁", colorVar: "var(--alert)",  bgClass: "bg-alert-dim border-alert/30 text-alert" },
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function scoreColor(v: number): string {
  if (v >= 75) return "var(--signal)";
  if (v >= 50) return "var(--warn)";
  return "var(--alert)";
}

function scoreLabel(v: number): string {
  if (v >= 80) return "Excellent";
  if (v >= 65) return "Good";
  if (v >= 50) return "Fair";
  return "Needs Work";
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);

  const [dashboard, setDashboard] = useState<DashboardResp | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResp | null>(null);
  const [replay, setReplay] = useState<ReplayEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "benchmark" | "replay" | "tips">("overview");

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
        <div className="glass-card p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-alert-dim border border-alert/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold mb-2">Error Loading Results</h2>
          <p className="text-alert font-mono text-sm mb-6">{error}</p>
          <button onClick={() => router.push("/")} className="px-4 py-2 rounded-lg border border-line text-sm hover:border-signal/30 hover:bg-signal-dim transition-all">
            ← Back to start
          </button>
        </div>
      </main>
    );
  }

  if (!dashboard || !benchmark) {
    return (
      <main className="flex-1 flex items-center justify-center relative overflow-hidden">
        <div className="orb orb-teal" />
        <div className="flex flex-col items-center gap-5 relative z-10 text-center">
          <div className="w-14 h-14 border-2 border-signal border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="font-display font-bold text-xl">Compiling your analytics</p>
            <p className="text-muted text-sm mt-1 font-mono">Crunching scores across all modules…</p>
          </div>
        </div>
      </main>
    );
  }

  const overall = Math.round(dashboard.overall_score);

  const radarData = [
    { metric: "Eye Contact",    you: Math.round(benchmark.user.eye_contact * 100),         benchmark: Math.round(benchmark.benchmark.eye_contact * 100) },
    { metric: "Technical",      you: benchmark.user.technical_score,                        benchmark: benchmark.benchmark.technical_score },
    { metric: "Communication",  you: benchmark.user.communication_score,                    benchmark: benchmark.benchmark.communication_score },
    { metric: "Energy",         you: Math.round(benchmark.user.energy_score * 100),         benchmark: Math.round(benchmark.benchmark.energy_score * 100) },
    { metric: "Pace Control",   you: Math.max(0, 100 - Math.abs(benchmark.user.speaking_speed - benchmark.benchmark.speaking_speed)), benchmark: 100 },
  ];

  const barData = [
    { name: "Technical",      you: Math.round(dashboard.technical_score),      bench: Math.round(benchmark.benchmark.technical_score) },
    { name: "Communication",  you: Math.round(dashboard.communication_score),  bench: Math.round(benchmark.benchmark.communication_score) },
    { name: "Eye Contact",    you: Math.round(dashboard.eye_contact_pct),      bench: Math.round(benchmark.benchmark.eye_contact * 100) },
    { name: "Energy",         you: Math.round(dashboard.energy_score * 100),   bench: Math.round(benchmark.benchmark.energy_score * 100) },
  ];

  const TABS = [
    { key: "overview",   label: "Overview" },
    { key: "benchmark",  label: "Benchmark" },
    { key: "replay",     label: `Replay (${replay.length})` },
    { key: "tips",       label: "AI Tips" },
  ] as const;

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden">
      <div className="bg-grid" />
      <div className="orb orb-teal" style={{ opacity: 0.4 }} />
      <div className="orb orb-purple" style={{ opacity: 0.4 }} />

      <div className="relative z-10 flex-1 flex flex-col">
        <div className="scanline" />

        {/* Header */}
        <div className="border-b border-line/60 px-4 sm:px-6 py-5" style={{ background: "rgba(5,7,9,0.6)", backdropFilter: "blur(16px)" }}>
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] text-signal tracking-[0.2em] mb-1">SESSION #{sessionId} · ANALYSIS COMPLETE</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">Interview Scorecard</h1>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 rounded-lg text-sm border border-line text-muted hover:border-signal/30 hover:text-signal hover:bg-signal-dim transition-all font-medium"
              >
                + New Interview
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
          {/* Overall score hero */}
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            {/* Big score */}
            <div className="glass-card p-6 flex items-center gap-6 sm:min-w-[260px]">
              <div className="relative flex items-center justify-center">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--line)" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="32"
                    fill="none"
                    stroke={scoreColor(overall)}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(overall / 100) * 201} 201`}
                    style={{ filter: `drop-shadow(0 0 6px ${scoreColor(overall)})`, transition: "stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)" }}
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="font-display font-bold text-2xl" style={{ color: scoreColor(overall) }}>{overall}</span>
                </div>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted tracking-wider">OVERALL SCORE</p>
                <p className="font-display font-bold text-xl mt-1" style={{ color: scoreColor(overall) }}>{scoreLabel(overall)}</p>
                <p className="text-xs text-muted mt-1">out of 100</p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              {[
                { label: "Confidence",   value: Math.round(dashboard.confidence_score),    unit: "" },
                { label: "Technical",    value: Math.round(dashboard.technical_score),      unit: "" },
                { label: "Communication", value: Math.round(dashboard.communication_score), unit: "" },
                { label: "Energy",       value: Math.round(dashboard.energy_score * 100),  unit: "%" },
              ].map((s, i) => (
                <div key={s.label} className={`glass-card p-4 text-center fade-up fade-up-delay-${i + 1}`}>
                  <p className="font-display font-bold text-2xl" style={{ color: scoreColor(s.value) }}>{s.value}{s.unit}</p>
                  <p className="font-mono text-[9px] text-muted mt-1 tracking-wider">{s.label.toUpperCase()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Eye Contact",    value: `${dashboard.eye_contact_pct}%`,           icon: "👁" },
              { label: "Speaking Pace",  value: `${dashboard.speaking_speed_avg} wpm`,      icon: "🎙" },
              { label: "Filler Words",   value: String(dashboard.filler_word_total),         icon: "💬" },
              { label: "Benchmark Role", value: benchmark.role,                              icon: "🎯" },
            ].map((s) => (
              <div key={s.label} className="glass-card p-4 flex items-center gap-3">
                <span className="text-xl shrink-0">{s.icon}</span>
                <div>
                  <p className="font-mono font-bold text-sm text-foreground">{s.value}</p>
                  <p className="font-mono text-[9px] text-muted tracking-wider">{s.label.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 p-1 rounded-lg border border-line" style={{ background: "var(--panel)" }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                  activeTab === tab.key
                    ? "text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
                style={activeTab === tab.key ? { background: "var(--panel-raised)", color: "var(--signal)" } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "overview" && (
            <div className="grid md:grid-cols-2 gap-6 fade-up">
              {/* Score breakdown bars */}
              <div className="glass-card p-6 space-y-5">
                <p className="font-mono text-[10px] text-muted tracking-wider uppercase">Score Breakdown</p>
                {[
                  { label: "Technical Depth",  value: dashboard.technical_score },
                  { label: "Communication",     value: dashboard.communication_score },
                  { label: "Confidence",        value: dashboard.confidence_score },
                  { label: "Eye Contact",       value: dashboard.eye_contact_pct },
                  { label: "Energy",            value: dashboard.energy_score * 100 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted">{item.label}</span>
                      <span className="font-mono font-bold" style={{ color: scoreColor(item.value) }}>
                        {Math.round(item.value)}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.round(item.value)}%`,
                          background: `linear-gradient(90deg, ${scoreColor(item.value)}, ${scoreColor(item.value)}88)`,
                          boxShadow: `0 0 8px ${scoreColor(item.value)}44`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Radar chart */}
              <div className="glass-card p-6">
                <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-4">You vs. Benchmark</p>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke="rgba(30,37,48,0.8)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#7a8494", fontSize: 10 }} />
                    <Radar name="You" dataKey="you" stroke="var(--signal)" fill="var(--signal)" fillOpacity={0.2} strokeWidth={2} />
                    <Radar name="Benchmark" dataKey="benchmark" stroke="var(--muted)" fill="var(--muted)" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 4" />
                    <Legend wrapperStyle={{ fontSize: 10, color: "#7a8494", paddingTop: 12 }} />
                    <Tooltip contentStyle={{ background: "#0d1017", border: "1px solid #1e2530", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#edf0f4" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === "benchmark" && (
            <div className="space-y-6 fade-up">
              <div className="glass-card p-6">
                <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-1">Benchmark Comparison</p>
                <p className="text-sm text-muted mb-6">Compared against profiles of placed candidates for <span className="text-foreground font-medium">{benchmark.role}</span></p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} barCategoryGap="30%" barGap={4}>
                    <XAxis dataKey="name" tick={{ fill: "#7a8494", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#7a8494", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0d1017", border: "1px solid #1e2530", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#edf0f4" }} />
                    <Bar dataKey="you" name="You" radius={[4, 4, 0, 0]} fill="var(--signal)" fillOpacity={0.9} />
                    <Bar dataKey="bench" name="Benchmark" radius={[4, 4, 0, 0]} fill="var(--muted)" fillOpacity={0.3} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#7a8494", paddingTop: 16 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(benchmark.gap).map(([key, gap]) => {
                  const you = benchmark.user[key] ?? 0;
                  const bench = benchmark.benchmark[key] ?? 0;
                  const isGood = gap >= 0;
                  return (
                    <div key={key} className="glass-card p-5">
                      <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-3">
                        {key.replace(/_/g, " ")}
                      </p>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="font-display font-bold text-2xl" style={{ color: scoreColor(typeof you === "number" && you <= 1 ? you * 100 : you) }}>
                            {typeof you === "number" && you <= 1 ? Math.round(you * 100) : Math.round(you)}
                          </p>
                          <p className="text-[10px] text-muted">Your score</p>
                        </div>
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${isGood ? "bg-signal-dim text-signal border border-signal/20" : "bg-alert-dim text-alert border border-alert/20"}`}>
                          {isGood ? "+" : ""}{typeof gap === "number" ? Math.round(gap) : gap}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-line flex justify-between text-[10px] text-muted">
                        <span>Benchmark: {typeof bench === "number" && bench <= 1 ? Math.round(bench * 100) : Math.round(bench)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "replay" && (
            <div className="glass-card p-6 fade-up">
              <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-1">Interview Replay Timeline</p>
              <p className="text-sm text-muted mb-6">Key moments detected during your interview session</p>

              {replay.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <p className="text-4xl mb-3">🎬</p>
                  <p className="font-medium">No notable moments detected</p>
                  <p className="text-sm mt-1 text-muted-dim">Complete more questions to see replay events</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[52px] top-0 bottom-0 w-px bg-line" />
                  <div className="space-y-3">
                    {replay.map((ev, i) => {
                      const cfg = EVENT_CONFIG[ev.event_type] ?? { label: ev.event_type, icon: "•", colorVar: "var(--muted)", bgClass: "bg-panel-raised border-line text-muted" };
                      return (
                        <div key={i} className="flex items-start gap-4 relative">
                          <span className="font-mono text-[10px] text-muted w-12 shrink-0 pt-2.5 text-right">{fmtTime(ev.timestamp_sec)}</span>
                          <div className={`relative z-10 w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-1.5 text-[10px] ${cfg.bgClass}`}>
                            {cfg.icon}
                          </div>
                          <div className={`flex-1 px-3 py-2 rounded-lg border text-xs ${cfg.bgClass}`}>
                            <p className="font-medium">{cfg.label}</p>
                            <p className="opacity-80 mt-0.5">{ev.label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "tips" && (
            <div className="space-y-4 fade-up">
              <div className="glass-card p-6">
                <p className="font-mono text-[10px] text-muted tracking-wider uppercase mb-1">AI Recommendations</p>
                <p className="text-sm text-muted mb-6">Personalized feedback based on your performance</p>
                <div className="space-y-3">
                  {dashboard.recommendations.map((rec, i) => (
                    <div key={i} className="flex gap-4 p-4 rounded-lg border border-line/60 bg-panel-raised hover:border-signal/20 transition-all group">
                      <span className="font-mono text-signal font-bold text-sm w-6 shrink-0 group-hover:text-signal transition-colors">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-sm text-foreground/90 leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick wins */}
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { title: "Pace", icon: "🎙", tip: dashboard.speaking_speed_avg > 160 ? "Slow down slightly. Aim for 130–150 WPM." : dashboard.speaking_speed_avg < 110 ? "Speak a bit faster to maintain energy." : "Great speaking pace!", ok: dashboard.speaking_speed_avg >= 110 && dashboard.speaking_speed_avg <= 160 },
                  { title: "Filler Words", icon: "💬", tip: dashboard.filler_word_total > 10 ? `You used ${dashboard.filler_word_total} filler words. Practice pausing instead of saying "um" or "uh".` : "Excellent! Minimal filler words detected.", ok: dashboard.filler_word_total <= 10 },
                  { title: "Eye Contact", icon: "👁", tip: dashboard.eye_contact_pct < 60 ? "Look at the camera lens more often — it signals confidence to interviewers." : "Good eye contact maintained throughout!", ok: dashboard.eye_contact_pct >= 60 },
                ].map((item) => (
                  <div key={item.title} className={`glass-card p-5 border ${item.ok ? "border-signal/20" : "border-warn/20"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{item.icon}</span>
                      <span className="font-medium text-sm">{item.title}</span>
                      <span className={`ml-auto text-xs font-mono ${item.ok ? "text-signal" : "text-warn"}`}>{item.ok ? "✓ OK" : "Improve"}</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{item.tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
