import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Navbar } from "@/components/Navbar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Interview Intelligence Engine — AI-Powered Mock Interviews",
  description:
    "Ace your next interview with real-time AI coaching. Analyzes eye contact, speaking pace, technical depth, and communication — benchmarked against placed candidates.",
  keywords: ["mock interview", "AI interview coach", "interview practice", "job interview preparation"],
  authors: [{ name: "Interview Intelligence Engine" }],
  openGraph: {
    title: "Interview Intelligence Engine",
    description: "AI-powered mock interview analysis with video, audio, and transcript intelligence.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground overflow-x-hidden">
        <AuthProvider>
          <Navbar />
          <div className="flex-1 flex flex-col relative">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
