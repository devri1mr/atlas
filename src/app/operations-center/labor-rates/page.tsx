// src/app/operations-center/labor-rates/page.tsx
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Division = { id: number; name?: string | null };
type JobRole = { id: number; name?: string | null };
type LaborRate = {
  id: number;
  division_id: number;
  job_role_id: number;
  hourly_rate: number | null;
  created_at?: string | null;
};

function envOk() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anon, ok: Boolean(url && anon) };
}

export default async function LaborRatesPage() {
  // This makes Next/Vercel treat the page as dynamic on every request.
  headers();

  const { url, anon, ok } = envOk();
  if (!ok || !url || !anon) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Operations Center</h1>
        <h2>Labor Rates</h2>
        <h3>Environment Error</h3>
        <pre>{JSON.stringify({ hasUrl: Boolean(url), hasAnon: Boolean(anon) }, null, 2)}</pre>
        <p>
          Fix in Vercel → Project Settings → Environment Variables:
          <br />• NEXT_PUBLIC_SUPABASE_URL
          <br />• NEXT_PUBLIC_SUPABASE_ANON_KEY
          <br />
          Make sure both are enabled for <b>Production</b>, then redeploy.
        </p>
      </main>
    );
  }

  const supabase = createClient(url, anon, { auth: { persistSession: false } });

  const [divisionsRes, rolesRes, ratesRes] = await Promise.all([
    supabase.from("divisions").select("id, name").order("id"),
    supabase.from("job_roles").select("id, name").order("id"),
    supabase
      .from("division_labor_rates")
      .select("id, division_id, job_role_id, hourly_rate, created_at")
      .order("division_id")
      .order("job_role_id"),
  ]);

  const divisions = (divisionsRes.data ?? []) as Division[];
  const roles = (rolesRes.data ?? []) as JobRole[];
  const rates = (ratesRes.data ?? []) as LaborRate[];

  const errors = {
    divisionsError: divisionsRes.error?.message ?? null,
    rolesError: rolesRes.error?.message ?? null,
    ratesError: ratesRes.error?.message ?? null,
  };

  const divNameById = new Map(divisions.map((d) => [d.id, d.name ?? `Division ${d.id}`]));
  const roleNameById = new Map(roles.map((r) => [r.id, r.name ?? `Role ${r.id}`]));

  return (
    <main style={{ padding: 24 }}>
      <h1>Operations Center</h1>
      <h2>Labor Rates</h2>

      {/* Quick debug that won't break the UI */}
      <details style={{ marginBottom: 16 }}>
        <summary>Debug</summary>
        <pre>
          {JSON.stringify(
            {
              envCheck: { hasUrl: true, hasAnon: true },
              ...errors,
              counts: { divisions: divisions.length, roles: roles.length, rates: rates.length },
            },
            null,
            2
          )}
        </pre>
      </details>

      {(errors.divisionsError || errors.rolesError || errors.ratesError) && (
        <div style={{ padding: 12, border: "1px solid #f99", marginBottom: 16 }}>
          <b>Supabase error(s):</b>
          <ul>
            {errors.divisionsError && <li>divisions: {errors.divisionsError}</li>}
            {errors.rolesError && <li>job_roles: {errors.rolesError}</li>}
            {errors.ratesError && <li>division_labor_rates: {errors.ratesError}</li>}
          </ul>
          <p>
            If you see “permission denied” or empty data with no errors, you likely need RLS
            policies (see below).
          </p>
        </div>
      )}

      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left" style={{ borderBottom: "1px solid #ddd" }}>Division</th>
            <th align="left" style={{ borderBottom: "1px solid #ddd" }}>Role</th>
            <th align="left" style={{ borderBottom: "1px solid #ddd" }}>Hourly Rate</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id}>
              <td style={{ borderBottom: "1px solid #eee" }}>
                {divNameById.get(r.division_id) ?? `Division ${r.division_id}`}
              </td>
              <td style={{ borderBottom: "1px solid #eee" }}>
                {roleNameById.get(r.job_role_id) ?? `Role ${r.job_role_id}`}
              </td>
              <td style={{ borderBottom: "1px solid #eee" }}>
                {r.hourly_rate ?? ""}
              </td>
            </tr>
          ))}
          {rates.length === 0 && (
            <tr>
              <td colSpan={3} style={{ paddingTop: 12 }}>
                No labor rates found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}