"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-line/60" style={{ background: "rgba(5,7,9,0.85)", backdropFilter: "blur(20px)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-7 h-7 rounded-md flex items-center justify-center relative" style={{ background: "linear-gradient(135deg, #00f5c8, #38bdf8)" }}>
            <span className="text-[#050709] font-bold text-xs">IIE</span>
          </div>
          <span className="font-display font-bold text-sm text-foreground hidden sm:block group-hover:text-signal transition-colors">
            Interview Intelligence
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1 text-xs font-mono">
          {pathname !== "/" && (
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md text-muted hover:text-foreground hover:bg-panel-raised transition-all"
            >
              New Session
            </Link>
          )}
        </div>

        {/* Auth area */}
        <div className="flex items-center gap-3 shrink-0">
          {status === "loading" ? (
            <div className="w-20 h-7 shimmer rounded-md" />
          ) : session ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-foreground leading-none">{session.user?.name}</span>
                <span className="text-[10px] text-muted mt-0.5 font-mono leading-none">{session.user?.email}</span>
              </div>
              {session.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-8 h-8 rounded-full border border-line object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full border border-line bg-panel-raised flex items-center justify-center">
                  <span className="text-xs font-bold text-signal">
                    {session.user?.name?.charAt(0) || "U"}
                  </span>
                </div>
              )}
              <button
                onClick={() => signOut()}
                className="hidden sm:block text-[11px] font-mono text-muted hover:text-alert transition-colors px-2 py-1 rounded-md hover:bg-alert/10"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("google")}
              className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md border border-line text-foreground hover:border-signal/40 hover:text-signal hover:bg-signal-dim transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
              </svg>
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
