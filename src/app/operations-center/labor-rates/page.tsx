import { createClient } from "@supabase/supabase-js";

export default async function LaborRatesPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Environment Error</h1>
        <pre>
          {JSON.stringify(
            {
              hasUrl: !!supabaseUrl,
              hasServiceKey: !!serviceKey,
            },
            null,
            2
          )}
        </pre>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: divisions, error: divisionsError } = await supabase
    .from("divisions")
    .select("*");

  const { data: roles, error: rolesError } = await supabase
    .from("job_roles")
    .select("*");

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