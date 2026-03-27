import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recalcDayLunch } from "@/lib/atDayRecalc";
import { weekStart } from "@/lib/atHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long-running — allow up to 5 minutes
export const maxDuration = 300;

/**
 * POST /api/atlas-time/backfill
 * Streams NDJSON progress updates while recalculating all completed punches.
 * Each line is a JSON object: { done, total } or { done, total, errors } at end.
 */
export async function POST() {
  const sb = supabaseAdmin();

  const { data: company } = await sb.from("companies").select("id").limit(1).single();
  if (!company) {
    return new Response(JSON.stringify({ error: "Company not found" }), { status: 404 });
  }
  const companyId = company.id;

  const { data: gs } = await sb
    .from("at_settings")
    .select("pay_period_start_day")
    .eq("company_id", companyId)
    .maybeSingle();
  const startDay: number = gs?.pay_period_start_day ?? 0;

  const { data: pairs, error } = await sb
    .from("at_punches")
    .select("employee_id, date_for_payroll")
    .eq("company_id", companyId)
    .not("clock_out_at", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const seen  = new Set<string>();
  const tasks: Array<{ employeeId: string; date: string }> = [];
  for (const { employee_id, date_for_payroll } of pairs ?? []) {
    const ws  = weekStart(new Date(date_for_payroll + "T12:00:00"), startDay);
    const key = `${employee_id}|${ws.toISOString().slice(0, 10)}`;
    if (!seen.has(key)) {
      seen.add(key);
      tasks.push({ employeeId: employee_id, date: date_for_payroll });
    }
  }

  const total = tasks.length;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: object) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      if (total === 0) {
        send({ done: 0, total: 0 });
        controller.close();
        return;
      }

      let done   = 0;
      let errors = 0;

      for (const { employeeId, date } of tasks) {
        try {
          await recalcDayLunch(sb, companyId, employeeId, date);
        } catch {
          errors++;
        }
        done++;
        send({ done, total, errors });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
