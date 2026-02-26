"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Prevent Next from trying to prerender this at build time
export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Finishing sign-in...");

  useEffect(() => {
    async function run() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (!code) {
          setMsg("Missing OAuth code. Try signing in again.");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMsg(`Auth error: ${error.message}`);
          return;
        }

        router.replace("/");
      } catch (e: any) {
        setMsg(`Unexpected error: ${e?.message ?? "Unknown"}`);
      }
    }

    run();
  }, [router]);

  return (
    <div style={{ padding: 24 }}>
      <p>{msg}</p>
    </div>
  );
}
