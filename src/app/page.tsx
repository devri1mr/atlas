"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function Home() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;

      if (user) {
        // Check if user has an active profile in user_profiles
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id, is_active")
          .eq("id", user.id)
          .single();

        if (!profile || !profile.is_active) {
          await supabase.auth.signOut();
          setDenied(true);
          setEmail(null);
        } else {
          window.location.replace("/dashboard");
          return;
        }
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
            <p className="text-white/80 text-sm leading-relaxed max-w-sm">
              Bringing pricing, execution, and performance into one system—engineered for exponential results.
            </p>
          </div>
        </div>

        {/* Right panel — sign in */}
        <div
          className="flex-1 flex flex-col min-h-screen lg:min-h-0"
          style={{ background: "linear-gradient(180deg, #ffffff 0%, #f4fbf5 38%, #1a5c2a 62%, #0a1f10 100%)" }}
        >
          {/* Desktop background override — plain gray on lg+ */}
          <div className="hidden lg:block absolute inset-y-0 right-0" style={{ width: "45%", background: "#f5f7f5", zIndex: 0 }} />

          {/* Mobile hero — logo in the light top section */}
          <div className="lg:hidden relative flex flex-col items-center justify-center pt-16 pb-10 px-6 text-center" style={{ flex: "0 0 44%" }}>
            {/* blue streak decorations (same as desktop) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute" style={{ top: "18%", left: "-10%", width: "120%", height: "1.5px", background: "linear-gradient(90deg, transparent 0%, #93c5fd 35%, #60a5fa 55%, transparent 100%)", transform: "rotate(-12deg)", opacity: 0.22 }} />
              <div className="absolute" style={{ top: "42%", right: "-5%", width: "70%", height: "1px", background: "linear-gradient(90deg, transparent 0%, #7dd3fc 50%, transparent 100%)", transform: "rotate(8deg)", opacity: 0.18 }} />
              <div className="absolute" style={{ top: "62%", left: "0%", width: "80%", height: "1.5px", background: "linear-gradient(90deg, transparent 0%, #60a5fa 40%, transparent 100%)", transform: "rotate(-5deg)", opacity: 0.14 }} />
            </div>
            <Image src="/atlas-logo.png" alt="Atlas" width={200} height={68} style={{ objectFit: "contain", mixBlendMode: "multiply" }} priority />
            <div className="w-10 h-px bg-green-700/30 mt-8 mb-5" />
            <h2 className="text-xl font-bold text-[#0d2616] leading-snug tracking-tight">
              Precision in the number.<br />
              <span className="text-green-700">Profit in the job.</span>
            </h2>
            <p className="mt-3 text-gray-500 text-xs leading-relaxed max-w-xs">
              Bringing pricing, execution, and performance into one system—engineered for exponential results.
            </p>
          </div>

          {/* Sign-in card area */}
          <div className="relative flex-1 lg:flex-none flex flex-col items-center justify-center px-6 py-10 lg:min-h-screen" style={{ zIndex: 1 }}>
            {/* Desktop: plain background */}
            <div className="hidden lg:block absolute inset-0" style={{ background: "#f5f7f5" }} />

            <div className="relative w-full max-w-sm mx-auto">

              {/* Desktop logo (hidden on mobile — handled above) */}
              <div className="hidden lg:flex mb-8 flex-col items-center text-center">
                {/* intentionally empty — desktop logo is on the left panel */}
              </div>

              <h1 className="text-2xl font-bold mb-1 text-white lg:text-gray-900 text-center lg:text-left">Sign in to Atlas</h1>
              <p className="text-sm mb-8 text-white/70 lg:text-gray-500 text-center lg:text-left">Use your Google account to access your workspace.</p>

              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl px-5 py-3.5 text-sm font-medium text-gray-800 hover:bg-gray-50 hover:border-gray-400 transition-all shadow-md"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              {denied && (
                <p className="mt-4 text-center text-xs font-medium text-red-300 lg:text-red-500">
                  Your account is not authorized. Contact your Atlas administrator to request access.
                </p>
              )}
              {!denied && (
                <p className="mt-5 text-center text-xs font-medium text-white/60 lg:text-gray-500">
                  Access restricted to invited users only.
                </p>
              )}

              <div className="mt-4 text-center text-xs text-white/40 lg:text-gray-400 flex items-center justify-center gap-3">
                <a href="/privacy" className="hover:underline">Privacy Policy</a>
                <span>·</span>
                <a href="/terms" className="hover:underline">Terms of Service</a>
              </div>

              <div className="mt-10 pt-6 border-t border-white/10 lg:border-gray-200 text-center">
                <a
                  href="https://interrivus.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-white/15 hover:border-green-400/40 hover:bg-white/5 lg:border-gray-200 lg:hover:border-green-300 lg:hover:bg-green-50 transition-all group shadow-sm"
                >
                  <Image
                    src="/interrivus-logo.png"
                    alt="InterRivus Systems"
                    width={36}
                    height={36}
                    style={{ objectFit: "contain" }}
                    className="lg:[mix-blend-mode:multiply]"
                  />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-widest leading-none mb-0.5 text-white/40 group-hover:text-green-300 lg:text-gray-400 lg:group-hover:text-green-600 transition-colors">Powered by</div>
                    <div className="text-[13px] font-semibold tracking-wide text-white/70 group-hover:text-white lg:text-gray-600 lg:group-hover:text-green-800 transition-colors">InterRivus Systems</div>
                  </div>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-1 text-white/25 group-hover:text-green-300 lg:text-gray-300 lg:group-hover:text-green-500 transition-colors"><path d="M3 9L9 3M9 3H5M9 3v4"/></svg>
                </a>
              </div>
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
