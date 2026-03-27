import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recalcDayLunch } from "@/lib/atDayRecalc";
import { weekStart } from "@/lib/atHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/atlas-time/backfill
 * Streams NDJSON progress. First line emits { settings } so the client can
 * confirm what lunch settings are active. Subsequent lines: { done, total }.
 *
 * Body (all optional):
 *   force_lunch_auto_deduct  – override DB setting (true/false)
 *   force_lunch_minutes      – override lunch_deduct_minutes
 *   force_lunch_after_hours  – override lunch_deduct_after_hours
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();

  const { data: company } = await sb.from("companies").select("id").limit(1).single();
  if (!company) {
    return new Response(JSON.stringify({ error: "Company not found" }), { status: 404 });
  }
  const companyId = company.id;

  const { data: gs } = await sb
    .from("at_settings")
    .select("pay_period_start_day, lunch_auto_deduct, lunch_deduct_after_hours, lunch_deduct_minutes")
    .eq("company_id", companyId)
    .maybeSingle();

  const startDay: number = gs?.pay_period_start_day ?? 0;

  // Allow caller to override DB settings (useful when DB value is stale/wrong)
  const effectiveLunchAutoDeduct: boolean =
    "force_lunch_auto_deduct" in body ? Boolean(body.force_lunch_auto_deduct) : (gs?.lunch_auto_deduct ?? false);
  const effectiveLunchMinutes: number =
    "force_lunch_minutes" in body ? Number(body.force_lunch_minutes) : (gs?.lunch_deduct_minutes ?? 30);
  const effectiveLunchAfterHours: number =
    "force_lunch_after_hours" in body ? Number(body.force_lunch_after_hours) : (gs?.lunch_deduct_after_hours ?? 6);

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

      // First message: confirm effective settings so client can display them
      send({
        settings: {
          lunch_auto_deduct:       effectiveLunchAutoDeduct,
          lunch_deduct_minutes:    effectiveLunchMinutes,
          lunch_deduct_after_hours: effectiveLunchAfterHours,
          db_lunch_auto_deduct:    gs?.lunch_auto_deduct ?? null,
        },
        done: 0,
        total,
      });

      if (total === 0) { controller.close(); return; }

      let done   = 0;
      let errors = 0;

      for (const { employeeId, date } of tasks) {
        try {
          await recalcDayLunch(sb, companyId, employeeId, date, {
            lunch_auto_deduct:       effectiveLunchAutoDeduct,
            lunch_deduct_minutes:    effectiveLunchMinutes,
            lunch_deduct_after_hours: effectiveLunchAfterHours,
          });
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
