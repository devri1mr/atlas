import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function LaborRatesPage() {
  const { data: divisions } = await supabase.from("divisions").select("*");
  const { data: roles } = await supabase.from("job_roles").select("*");
  const { data: rates } = await supabase.from("division_labor_rates").select("*");

  return (
    <main style={{ padding: 24 }}>
      <h1>Operations Center</h1>
      <h2>Labor Rates</h2>

      <pre>
        {JSON.stringify({ divisions, roles, rates }, null, 2)}
      </pre>
    </main>
  );
}