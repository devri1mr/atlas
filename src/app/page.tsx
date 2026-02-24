"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const sessionEmail = data.session?.user?.email ?? null;

      // Enforce @garpielgroup.com only
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
  }, []);

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

  if (!email) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Atlas</h1>
        <p>InterRivus Systems — Crafted by MRD</p>

        <button
          onClick={signInWithGoogle}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Atlas</h1>
      <p>
        Signed in as: <strong>{email}</strong>
      </p>

      <button
        onClick={signOut}
        style={{ padding: "10px 14px", cursor: "pointer" }}
      >
        Sign out
      </button>
    </div>
  );
}