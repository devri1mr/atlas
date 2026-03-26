import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recalcDayLunch } from "@/lib/atDayRecalc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

const PUNCH_SELECT = `
  id, employee_id, clock_in_at, clock_out_at, date_for_payroll,
  punch_method, status, division_id, at_division_id, employee_note, manager_note,
  is_manual, regular_hours, ot_hours, dt_hours, lunch_deducted_mins,
  approved_by, approved_at, locked,
  at_employees(id, first_name, last_name, preferred_name, job_title,
    department_id, default_pay_rate, pay_type,
    lunch_auto_deduct, lunch_deduct_after_hours, lunch_deduct_minutes,
    at_departments(id, name)),
  divisions(id, name, qb_class_name),
  at_divisions!at_division_id(id, name)
`;

// GET — today's punches (no params) OR date-range filtered (date_from + date_to)
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const url          = new URL(req.url);
    const dateFrom     = url.searchParams.get("date_from");
    const dateTo       = url.searchParams.get("date_to");
    const empIds       = url.searchParams.get("employee_ids")?.split(",").filter(Boolean) ?? [];
    const divIds       = url.searchParams.get("division_ids")?.split(",").filter(Boolean) ?? [];
    const statusFilter = url.searchParams.get("status");

    const today = new Date().toISOString().slice(0, 10);
    const from  = dateFrom ?? today;
    const to    = dateTo   ?? today;

    let q = sb
      .from("at_punches")
      .select(PUNCH_SELECT)
      .eq("company_id", companyId)
      .gte("date_for_payroll", from)
      .lte("date_for_payroll", to)
      .order("clock_in_at", { ascending: true });

    if (empIds.length > 0) q = q.in("employee_id", empIds);
    if (divIds.length > 0) q = q.in("division_id", divIds);
    if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ punches: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — clock in (existing) OR full manual punch (is_manual: true with clock_in_at + optional clock_out_at)
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body       = await req.json().catch(() => ({}));
    const employeeId = String(body.employee_id ?? "").trim();
    if (!employeeId) return NextResponse.json({ error: "employee_id required" }, { status: 400 });

    const isManual = !!body.is_manual;

    // Manual punch: clock_in_at provided explicitly (custom date/time)
    if (isManual) {
      if (!body.clock_in_at) return NextResponse.json({ error: "clock_in_at required for manual punch" }, { status: 400 });

      const clockIn  = new Date(body.clock_in_at);
      const clockOut = body.clock_out_at ? new Date(body.clock_out_at) : null;
      const dateForPayroll = body.date_for_payroll ?? clockIn.toISOString().slice(0, 10);

      let regularHours: number | null = null;
      if (clockOut) {
        regularHours = Math.round(((clockOut.getTime() - clockIn.getTime()) / 3_600_000) * 100) / 100;
      }

      const { data, error } = await sb
        .from("at_punches")
        .insert({
          company_id:       companyId,
          employee_id:      employeeId,
          clock_in_at:      clockIn.toISOString(),
          clock_out_at:     clockOut?.toISOString() ?? null,
          date_for_payroll: dateForPayroll,
          punch_method:        "manual",
          is_manual:           true,
          division_id:         body.division_id    ?? null,
          at_division_id:      body.at_division_id ?? null,
          employee_note:       body.note ?? null,
          manager_note:        body.manager_note ?? null,
          status:              clockOut ? "pending" : "open",
          regular_hours:       body.regular_hours != null ? Number(body.regular_hours) : regularHours,
          ot_hours:            body.ot_hours != null ? Number(body.ot_hours) : null,
          dt_hours:            body.dt_hours != null ? Number(body.dt_hours) : null,
          lunch_deducted_mins: body.lunch_deducted_mins != null ? Number(body.lunch_deducted_mins) : null,
        })
        .select(PUNCH_SELECT)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Recalculate day-level lunch across all punches for this employee+date
      if (clockOut) {
        await recalcDayLunch(sb, companyId, employeeId, dateForPayroll);
        const { data: updated } = await sb.from("at_punches").select(PUNCH_SELECT).eq("id", data!.id).single();
        return NextResponse.json({ punch: updated ?? data }, { status: 201 });
      }

      return NextResponse.json({ punch: data }, { status: 201 });
    }

    // Standard clock-in: check not already clocked in
    const { data: open } = await sb
      .from("at_punches")
      .select("id")
      .eq("employee_id", employeeId)
      .is("clock_out_at", null)
      .maybeSingle();

    if (open) return NextResponse.json({ error: "Already clocked in" }, { status: 409 });

    const now   = new Date();
    const today = now.toISOString().slice(0, 10);

    const { data, error } = await sb
      .from("at_punches")
      .insert({
        company_id:       companyId,
        employee_id:      employeeId,
        clock_in_at:      now.toISOString(),
        date_for_payroll: today,
        punch_method:     body.punch_method ?? "admin",
        division_id:      body.division_id    ?? null,
        at_division_id:   body.at_division_id ?? null,
        clock_in_lat:     body.lat ?? null,
        clock_in_lng:     body.lng ?? null,
        employee_note:    body.note ?? null,
        status:           "open",
      })
      .select("id, employee_id, clock_in_at, clock_out_at, date_for_payroll, punch_method, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ punch: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
