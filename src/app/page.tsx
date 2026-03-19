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
        <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
          style={{ background: "linear-gradient(160deg, #0a1f10 0%, #123b1f 45%, #1a5c2a 100%)" }}>

          {/* Decorative rings */}
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full border border-white/5" />
          <div className="absolute -top-16 -left-16 w-[350px] h-[350px] rounded-full border border-white/5" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #4ade80, transparent 70%)" }} />

          <div className="relative">
            <Image src="/atlas-logo.png" alt="Atlas" width={160} height={52} style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} priority />
          </div>

          <div className="relative space-y-6">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Every job.<br />Every detail.<br />
              <span className="text-green-400">In one place.</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              Atlas is the complete operations platform for landscaping — bids, inventory, materials, and your team, unified.
            </p>
          </div>

          <p className="relative text-white/20 text-xs tracking-widest uppercase">
            Powered by InterRivus Systems
          </p>
        </div>

        {/* Right panel — sign in */}
        <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
          <div className="w-full max-w-sm">

            {/* Mobile logo */}
            <div className="lg:hidden mb-10 text-center">
              <Image src="/atlas-logo.png" alt="Atlas" width={120} height={40} style={{ objectFit: "contain" }} priority />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
            <p className="text-gray-400 text-sm mb-8">Sign in to your Atlas account</p>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <p className="mt-6 text-center text-xs text-gray-400">
              Access restricted to authorized accounts only.
            </p>

            <div className="mt-16 pt-8 border-t border-gray-100 text-center">
              <p className="text-[11px] text-gray-300 tracking-widest uppercase">Atlas · InterRivus Systems</p>
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
