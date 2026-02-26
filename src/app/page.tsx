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

      // Optional domain restriction
      if (sessionEmail && !sessionEmail.endsWith("@garpielgroup.com")) {
        await supabase.auth.signOut();
        setEmail(null);
      } else {
        setEmail(sessionEmail);
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

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  // LOGIN SCREEN
  if (!email) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Image
            src="/atlas-logo.png"
            alt="Atlas Logo"
            width={420}
            height={420}
            priority
          />

          <p
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "#777",
              letterSpacing: 1,
            }}
          >
            Crafted by MRD
          </p>

          <button
            onClick={signInWithGoogle}
            style={{
              marginTop: 26,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 6,
              border: "1px solid #dadce0",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              minWidth: 240,
              marginLeft: "auto",
              marginRight: "auto",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // AUTHENTICATED VIEW
  return (
    <div style={{ padding: 24 }}>
      <Image
        src="/atlas-logo.png"
        alt="Atlas Logo"
        width={180}
        height={180}
        priority
      />

      <p style={{ marginTop: 16 }}>
        Signed in as: <strong>{email}</strong>
      </p>

      <button
        onClick={signOut}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          cursor: "pointer",
          borderRadius: 6,
          border: "1px solid #dadce0",
          backgroundColor: "#ffffff",
        }}
      >
        Sign out
      </button>
    </div>
  );
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
