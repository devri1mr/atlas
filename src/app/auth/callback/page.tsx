"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const sb = getSupabaseClient();
      await sb.auth.getSession(); // allows Supabase to process the URL if needed
      router.replace("/dashboard");
    })();
  }, [router]);

  return <div style={{ padding: 24 }}>Signing you in…</div>;
}
