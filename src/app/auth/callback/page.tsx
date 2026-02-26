"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// 🚨 This is the important line.
// It prevents Next from prerendering this page at build time.
export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuth() {
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      );

      if (!error) {
        router.replace("/");
      } else {
        console.error(error);
      }
    }

    handleAuth();
  }, [router]);

  return <div style={{ padding: 24 }}>Completing sign-in...</div>;
}
