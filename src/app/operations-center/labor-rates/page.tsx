import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function LaborRatesPage() {
  // Fetch divisions
  const { data: divisions, error: divisionsError } = await supabase
    .from("divisions")
    .select("*");

  // Fetch job roles
  const { data: roles, error: rolesError } = await supabase
    .from("job_roles")
    .select("*");

  // Fetch labor rates
  const { data: rates, error: ratesError } = await supabase
    .from("division_labor_rates")
    .select("*");

  return (
    <main style={{ padding: 24 }}>
      <h1>Operations Center</h1>
      <h2>Labor Rates</h2>

      <pre>
        {JSON.stringify(
          {
            divisionsError,
            rolesError,
            ratesError,
            divisions,
            roles,
            rates,
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}