// src/app/auth/callback/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

// Prevent Next from trying to prerender this at build time
export const dynamic = "force-dynamic";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const sb = getSupabaseClient();

      // If env vars aren't present, don’t crash — just route away.
      if (!sb) {
        router.replace("/auth?error=supabase_env_missing");
        return;
      }

      // Finishes the OAuth code exchange / session detection
      await sb.auth.getSession();

      router.replace("/");
    };

    run();
  }, [router]);

  return <p>Signing you in…</p>;
}