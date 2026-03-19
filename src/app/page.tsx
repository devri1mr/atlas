"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function Home() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const sessionEmail = data.session?.user?.email ?? null;

      if (sessionEmail && !sessionEmail.endsWith("@garpielgroup.com")) {
        await supabase.auth.signOut();
        setEmail(null);
      } else if (sessionEmail) {
        // Already logged in — send to dashboard
        window.location.replace("/dashboard");
        return;
      } else {
        setEmail(null);
      }

      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 100%)" }}>
        <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // LOGIN SCREEN
  if (!email) {
    return (
      <div className="min-h-screen flex" style={{ fontFamily: "var(--font-geist-sans)" }}>

        {/* Left panel — brand */}
        <div className="hidden lg:flex flex-col w-[55%] relative overflow-hidden"
          style={{ background: "linear-gradient(180deg, #ffffff 0%, #f4fbf5 38%, #1a5c2a 62%, #0a1f10 100%)" }}>

          {/* Blue streak decorations */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute" style={{ top: "8%", left: "-15%", width: "130%", height: "2px", background: "linear-gradient(90deg, transparent 0%, #93c5fd 35%, #60a5fa 55%, transparent 100%)", transform: "rotate(-14deg)", opacity: 0.25 }} />
            <div className="absolute" style={{ top: "20%", left: "-5%", width: "75%", height: "1px", background: "linear-gradient(90deg, transparent 0%, #bfdbfe 45%, transparent 100%)", transform: "rotate(-10deg)", opacity: 0.3 }} />
            <div className="absolute" style={{ top: "34%", right: "-8%", width: "65%", height: "1.5px", background: "linear-gradient(90deg, transparent 0%, #7dd3fc 50%, #3b82f6 70%, transparent 100%)", transform: "rotate(7deg)", opacity: 0.18 }} />
            <div className="absolute" style={{ top: "50%", left: "5%", width: "90%", height: "1px", background: "linear-gradient(90deg, transparent 0%, #60a5fa 40%, #93c5fd 60%, transparent 100%)", transform: "rotate(-4deg)", opacity: 0.15 }} />
            <div className="absolute" style={{ bottom: "28%", left: "-10%", width: "80%", height: "2px", background: "linear-gradient(90deg, transparent 0%, #3b82f6 40%, #60a5fa 65%, transparent 100%)", transform: "rotate(12deg)", opacity: 0.12 }} />
            <div className="absolute" style={{ bottom: "12%", right: "-5%", width: "55%", height: "1px", background: "linear-gradient(90deg, transparent 0%, #93c5fd 50%, transparent 100%)", transform: "rotate(-18deg)", opacity: 0.2 }} />
          </div>

          {/* Top white section — logo */}
          <div className="relative flex items-center justify-center" style={{ flex: "0 0 52%" }}>
            <Image
              src="/atlas-logo.png"
              alt="Atlas"
              width={500}
              height={500}
              style={{ objectFit: "contain", maxHeight: "72%", maxWidth: "80%", mixBlendMode: "multiply" }}
              priority
            />
          </div>

          {/* Bottom green section — slogan */}
          <div className="relative flex flex-col items-center justify-center flex-1 px-16 text-center">
            <div className="w-16 h-px bg-green-300/30 mb-8" />
            <h2 className="text-3xl font-bold text-white leading-snug tracking-tight mb-5">
              Precision in the number.<br />
              <span className="text-green-300">Profit in the job.</span>
            </h2>
            <p className="text-white/45 text-sm leading-relaxed max-w-sm">
              Bringing pricing, execution, and performance into one system—engineered for exponential results.
            </p>
          </div>
        </div>

        {/* Right panel — sign in */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12" style={{ background: "#f5f7f5" }}>
          <div className="w-full max-w-sm">

            {/* Mobile logo */}
            <div className="lg:hidden mb-10 text-center">
              <Image src="/atlas-logo.png" alt="Atlas" width={180} height={60} style={{ objectFit: "contain", mixBlendMode: "multiply" }} priority />
              <p className="mt-3 text-xs text-gray-500 italic">Precision in the number. Profit in the job.</p>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
            <p className="text-gray-500 text-sm mb-8">Sign in to your Atlas account to continue.</p>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl px-5 py-3.5 text-sm font-medium text-gray-800 hover:bg-gray-50 hover:border-gray-400 transition-all shadow-md"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <p className="mt-5 text-center text-xs text-gray-500 font-medium">
              Access restricted to authorized accounts only.
            </p>

            <div className="mt-16 pt-8 border-t border-gray-200 text-center">
              <a
                href="https://interrivus.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all group shadow-sm"
              >
                <Image
                  src="/interrivus-logo.png"
                  alt="InterRivus Systems"
                  width={36}
                  height={36}
                  style={{ objectFit: "contain", mixBlendMode: "multiply" }}
                />
                <div className="text-left">
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-0.5 group-hover:text-green-600 transition-colors">Powered by</div>
                  <div className="text-[13px] font-semibold text-gray-600 tracking-wide group-hover:text-green-800 transition-colors">InterRivus Systems</div>
                </div>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 group-hover:text-green-500 transition-colors ml-1"><path d="M3 9L9 3M9 3H5M9 3v4"/></svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated — redirect handled in useEffect
  return null;
}


function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.9 6.1 29.8 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.1-.1-2.2-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.3 19 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.9 6.1 29.8 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10.1-2 13.7-5.3l-6.3-5.2C29.5 35.1 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.4 40.1 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1 2.7-3 4.9-5.6 6.3l6.3 5.2C39.5 36.2 44 30.6 44 24c0-1.1-.1-2.2-.4-3.5z"
      />
    </svg>
  );
}
