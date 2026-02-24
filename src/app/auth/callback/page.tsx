"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@lib/supabaseclient";

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const handleAuth = async () => {
      await supabase.auth.getSession();
      router.push("/");
    };

    handleAuth();
  }, [router, supabase]);

  return <p>Signing you in...</p>;
}