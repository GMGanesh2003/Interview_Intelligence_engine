"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

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
        console.error("Error parsing PDF:", err);
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
      const session = await api.createSession({
        resume_text: resumeText,
        role,
        experience,
        num_questions: numQuestions,
      });
      router.push(`/interview/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden">
      <div className="bg-grid" />
      <div className="scanline z-10" />
      <div className="max-w-3xl w-full mx-auto px-6 py-16 flex-1 flex flex-col z-10 relative">
        <header className="mb-10">
          <p className="font-mono text-xs text-signal tracking-[0.2em] mb-3">REC · MODULE 01</p>
          <h1 className="font-display text-4xl font-bold leading-tight">
            Interview Intelligence Engine
          </h1>
          <p className="text-muted mt-3 max-w-xl">
            Run a recorded mock interview. Every signal — eye contact, speaking pace, filler
            words, technical depth — gets measured and benchmarked against placed candidates.
          </p>
        </header>

        {status === "loading" ? (
          <div className="flex justify-center py-10">
            <p className="text-muted">Loading...</p>
          </div>
        ) : !session ? (
          <Card>
            <CardHeader>
              <CardTitle>Sign in to continue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-signal/10 border border-signal/20 text-signal text-sm p-3 rounded-sm leading-relaxed mb-5">
                <span className="block mb-1"><strong>👋 Note for Reviewers:</strong></span>
                If Google Login fails on this specific preview link, you can fully test the application by clicking <strong>Continue as Guest</strong> below.
              </div>
              <Button onClick={() => signIn("google")} size="lg" className="w-full">
                Sign in with Google
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-line" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted">Or</span>
                </div>
              </div>
              <Button onClick={() => signIn("credentials")} variant="outline" size="lg" className="w-full">
                Continue as Guest
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Session setup</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="block text-sm mb-2 text-foreground/90">Resume / background</label>
              <div className="flex items-center gap-4 mb-3">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-foreground/90 file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-semibold file:bg-panel-raised file:text-signal hover:file:bg-signal/10"
                />
              </div>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Or paste your resume text, or a short summary of your skills and projects..."
                rows={6}
                className="w-full rounded-sm bg-panel-raised border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-signal resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2 text-foreground/90">Target role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-sm bg-panel-raised border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-signal"
                >
                  <option value="Software Engineer">Software Engineer</option>
                  <option value="Frontend Engineer">Frontend Engineer</option>
                  <option value="Backend Engineer">Backend Engineer</option>
                  <option value="Fullstack Engineer">Fullstack Engineer</option>
                  <option value="Data Scientist">Data Scientist</option>
                  <option value="Product Manager">Product Manager</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2 text-foreground/90">Experience level</label>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full rounded-sm bg-panel-raised border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-signal"
                >
                  <option value="fresher">Fresher / Student</option>
                  <option value="0-1 years">0–1 years</option>
                  <option value="1-3 years">1–3 years</option>
                  <option value="3-5 years">3–5 years</option>
                  <option value="5+ years">5+ years</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-foreground/90">
                Number of questions: <span className="font-mono text-signal">{numQuestions}</span>
              </label>
              <input
                type="range"
                min={3}
                max={8}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                className="w-full accent-[#5eead4]"
              />
            </div>

            {error && <p className="text-sm text-alert font-mono">{error}</p>}

            <Button onClick={handleSubmit} disabled={!canSubmit} size="lg" className="w-full">
              {loading ? "Generating questions…" : "Start mock interview"}
            </Button>
          </CardContent>
        </Card>
        )}
      </div>
    </main>
  );
}
