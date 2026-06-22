"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { api } from "@/lib/api";

const ROLES = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Fullstack Engineer",
  "Data Scientist",
  "Machine Learning Engineer",
  "Product Manager",
  "DevOps Engineer",
];

const EXPERIENCES = [
  { value: "fresher", label: "Fresher / Student" },
  { value: "0-1 years", label: "0–1 years" },
  { value: "1-3 years", label: "1–3 years" },
  { value: "3-5 years", label: "3–5 years" },
  { value: "5+ years", label: "5+ years" },
];

const FEATURES = [
  {
    icon: "👁",
    title: "Eye Contact Tracking",
    desc: "Real-time face mesh analysis monitors gaze direction and presence throughout your session.",
    color: "signal",
  },
  {
    icon: "🎙",
    title: "Audio Intelligence",
    desc: "Detects filler words, speaking pace, pauses, and vocal energy on every answer.",
    color: "blue",
  },
  {
    icon: "🧠",
    title: "Technical Depth",
    desc: "AI evaluates correctness, clarity, STAR framework usage, and reasoning quality.",
    color: "purple",
  },
  {
    icon: "📊",
    title: "Benchmark Analysis",
    desc: "Your scores are compared against profiles of candidates placed at top companies.",
    color: "warn",
  },
];

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [resumeText, setResumeText] = useState("");
  const [role, setRole] = useState("Software Engineer");
  const [experience, setExperience] = useState("fresher");
  const [numQuestions, setNumQuestions] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = resumeText.trim().length > 10 && role.trim().length > 1 && !loading;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf") {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          text += strings.join(" ") + "\n";
        }
        setResumeText(text);
        setError(null);
      } catch (err) {
        setError(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (file.type === "text/plain") {
      const text = await file.text();
      setResumeText(text);
      setError(null);
    } else {
      setError("Please upload a .pdf or .txt file.");
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const s = await api.createSession({ resume_text: resumeText, role, experience, num_questions: numQuestions });
      router.push(`/interview/${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="bg-grid" />
      <div className="orb orb-teal" />
      <div className="orb orb-purple" />

      <div className="relative z-10 flex flex-col">
        {/* Hero Section */}
        <section className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16">
          <div className="scanline mb-12" />

          {!session && status !== "loading" ? (
            /* ── Landing hero for unauthenticated users ── */
            <div className="flex flex-col lg:flex-row gap-12 items-center">
              {/* Left: copy */}
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-signal/30 bg-signal-dim text-signal text-xs font-mono tracking-wider mb-6">
                  <span className="signal-dot" />
                  AI-POWERED INTERVIEW COACH
                </div>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6">
                  Ace your next{" "}
                  <span className="text-gradient">interview</span>
                  <br className="hidden sm:block" /> with AI precision
                </h1>
                <p className="text-muted text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                  Every signal — eye contact, speaking pace, filler words, technical depth — gets
                  measured and benchmarked against placed candidates in real time.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <button
                    id="google-signin-btn"
                    onClick={() => signIn("google")}
                    className="group flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg font-medium text-sm transition-all"
                    style={{ background: "linear-gradient(135deg, #00f5c8, #38bdf8)", color: "#050709" }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
                    </svg>
                    Continue with Google
                  </button>
                  <button
                    id="guest-signin-btn"
                    onClick={() => signIn("credentials")}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg font-medium text-sm border border-line text-foreground hover:border-signal/30 hover:bg-signal-dim transition-all"
                  >
                    Continue as Guest
                  </button>
                </div>

                <div className="mt-6 p-3 rounded-lg border border-warn/20 bg-warn-dim text-warn text-xs leading-relaxed max-w-md mx-auto lg:mx-0">
                  <strong>👋 Note:</strong> If Google Login fails on this preview link, use <strong>Continue as Guest</strong> to test all features.
                </div>
              </div>

              {/* Right: Features grid */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                {FEATURES.map((f, i) => (
                  <div
                    key={f.title}
                    className={`glass-card p-5 fade-up fade-up-delay-${i + 1}`}
                  >
                    <div className="text-2xl mb-3">{f.icon}</div>
                    <h3 className="font-display font-semibold text-sm text-foreground mb-1.5">{f.title}</h3>
                    <p className="text-xs text-muted leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : status === "loading" ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-signal border-t-transparent rounded-full animate-spin" />
                <p className="text-muted text-sm font-mono">Loading session…</p>
              </div>
            </div>
          ) : (
            /* ── Session setup for authenticated users ── */
            <div className="flex flex-col lg:flex-row gap-10 items-start">
              {/* Left: setup form */}
              <div className="flex-1 w-full">
                <div className="mb-6">
                  <p className="font-mono text-xs text-signal tracking-[0.2em] mb-2">MODULE 01 · SESSION SETUP</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
                    Configure your mock interview
                  </h1>
                  <p className="text-muted mt-2 text-sm">
                    Welcome back, <span className="text-foreground font-medium">{session?.user?.name?.split(" ")[0]}</span>. Set up your session below.
                  </p>
                </div>

                <div className="glass-card p-6 space-y-6">
                  {/* Resume input */}
                  <div>
                    <label className="block text-sm font-medium mb-2.5 text-foreground/90" htmlFor="resume-upload">
                      Resume / Background
                    </label>
                    <div className="mb-3">
                      <label
                        htmlFor="resume-upload"
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-dashed border-line hover:border-signal/40 cursor-pointer text-sm text-muted hover:text-signal transition-all group"
                        style={{ background: "rgba(0,245,200,0.02)" }}
                      >
                        <svg className="w-4 h-4 shrink-0 group-hover:text-signal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Upload PDF or TXT resume
                        <input id="resume-upload" type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="sr-only" />
                      </label>
                    </div>
                    <textarea
                      id="resume-text"
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      placeholder="Or paste your resume text, skills, and projects here…"
                      rows={6}
                      className="w-full rounded-lg border border-line px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-signal/40 focus:ring-1 focus:ring-signal/20 resize-none transition-all"
                      style={{ background: "rgba(19,24,32,0.8)", color: "var(--foreground)" }}
                    />
                    {resumeText && (
                      <p className="text-[11px] text-signal font-mono mt-1.5">
                        ✓ {resumeText.trim().split(/\s+/).length} words loaded
                      </p>
                    )}
                  </div>

                  {/* Role + Experience */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-foreground/90">Target Role</label>
                      <select
                        id="target-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:outline-none focus:border-signal/40 focus:ring-1 focus:ring-signal/20 transition-all appearance-none cursor-pointer"
                        style={{ background: "rgba(19,24,32,0.8)", color: "var(--foreground)" }}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-foreground/90">Experience Level</label>
                      <select
                        id="experience-level"
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                        className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:outline-none focus:border-signal/40 focus:ring-1 focus:ring-signal/20 transition-all appearance-none cursor-pointer"
                        style={{ background: "rgba(19,24,32,0.8)", color: "var(--foreground)" }}
                      >
                        {EXPERIENCES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Question count */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-medium text-foreground/90">Number of Questions</label>
                      <span className="font-mono text-signal font-bold text-lg">{numQuestions}</span>
                    </div>
                    <input
                      id="num-questions"
                      type="range"
                      min={3}
                      max={8}
                      value={numQuestions}
                      onChange={(e) => setNumQuestions(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: "var(--signal)" }}
                    />
                    <div className="flex justify-between text-[10px] text-muted font-mono mt-1">
                      <span>3 min</span>
                      <span>~{numQuestions * 3}–{numQuestions * 5} min session</span>
                      <span>8 max</span>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-alert/30 bg-alert-dim text-alert text-sm">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-mono text-xs">{error}</span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    id="start-interview-btn"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="w-full py-3.5 rounded-lg font-semibold text-sm transition-all relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: canSubmit ? "linear-gradient(135deg, #00f5c8, #38bdf8)" : "var(--panel-raised)",
                      color: canSubmit ? "#050709" : "var(--muted)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-[#050709]/40 border-t-[#050709] rounded-full animate-spin" />
                        Generating questions…
                      </span>
                    ) : (
                      "Start mock interview →"
                    )}
                  </button>
                </div>
              </div>

              {/* Right: what to expect */}
              <div className="w-full lg:w-72 shrink-0 space-y-4">
                <p className="font-mono text-[10px] text-muted tracking-wider uppercase">What we measure</p>
                {FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-3 p-4 glass-card">
                    <span className="text-xl shrink-0">{f.icon}</span>
                    <div>
                      <p className="font-medium text-sm text-foreground">{f.title}</p>
                      <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
