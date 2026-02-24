// src/app/operations-center/labor-rates/page.tsx
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function LaborRatesPage() {
  const divisionsRes = await supabase.from("divisions").select("*");
  const rolesRes = await supabase.from("job_roles").select("*");
  const ratesRes = await supabase.from("division_labor_rates").select("*");

  return (
    <main style={{ padding: 24 }}>
      <h1>Operations Center</h1>
      <h2>Labor Rates</h2>

      <pre style={{ whiteSpace: "pre-wrap" }}>
        {JSON.stringify(
          {
            envCheck: {
              hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
              hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            },
            divisionsError: divisionsRes.error,
            rolesError: rolesRes.error,
            ratesError: ratesRes.error,
            divisions: divisionsRes.data,
            roles: rolesRes.data,
            rates: ratesRes.data,
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}