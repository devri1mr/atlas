// atlas/src/app/page.tsx
import { supabase } from "@/lib/supabaseClient";

export default async function Home() {
  // Simple connectivity test: ask Supabase for the current auth session
  // (This should not crash even if no user is logged in)
  const { data, error } = await supabase.auth.getSession();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>Atlas</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        InterRivus Systems — Crafted by MRD
      </p>

      <div style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Supabase Connection Test</h2>
        <p style={{ marginBottom: 8 }}>
          Status:{" "}
          <strong>
            {error ? "Error" : "OK"}
          </strong>
        </p>
        {error ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(error, null, 2)}</pre>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify({ hasSession: !!data.session }, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}
