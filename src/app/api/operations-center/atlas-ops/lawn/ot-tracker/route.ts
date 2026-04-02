import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "America/New_York";

/** Get YYYY-MM-DD in Eastern time */
function easternDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Count remaining weekdays from tomorrow through end of current week (Friday) */
function remainingWeekdays(todayDow: number): number {
  // todayDow: 0=Sun,1=Mon,...,5=Fri,6=Sat
  if (todayDow === 0 || todayDow === 6) return 0;
  return Math.max(0, 5 - todayDow);
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // ── Current week boundaries (Eastern, Mon–Sun) ────────────────────────────
    const now = new Date();
    const todayStr = easternDateStr(now);
    const [yr, mo, dy] = todayStr.split("-").map(Number);
    const todayDate = new Date(yr, mo - 1, dy);
    const dow = todayDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dow === 0 ? 6 : dow - 1;

    const monday = new Date(yr, mo - 1, dy - daysFromMonday);
    const sunday = new Date(yr, mo - 1, dy - daysFromMonday + 6);

    function fmtDate(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const weekStart = fmtDate(monday);
    const weekEnd   = fmtDate(sunday);
    const remaining = remainingWeekdays(dow);

    // ── Aggregate weekly hours per employee ───────────────────────────────────
    const { data: punches, error } = await sb
      .from("at_punches")
      .select(`
        employee_id,
        date_for_payroll,
        regular_hours,
        ot_hours,
        at_employees!inner(first_name, last_name, preferred_name, photo_url, status)
      `)
      .eq("company_id", company.id)
      .gte("date_for_payroll", weekStart)
      .lte("date_for_payroll", weekEnd)
      .not("clock_out_at", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aggregate per employee
    const empMap = new Map<string, {
      name: string;
      photo_url: string | null;
      total_hours: number;
      days: Set<string>;
    }>();

    for (const p of punches ?? []) {
      const emp = (p as any).at_employees;
      if (!emp || emp.status !== "active") continue;

      const displayName = emp.preferred_name
        ? `${emp.preferred_name} ${emp.last_name}`
        : `${emp.first_name} ${emp.last_name}`;

      const existing = empMap.get(p.employee_id) ?? {
        name: displayName,
        photo_url: emp.photo_url ?? null,
        total_hours: 0,
        days: new Set<string>(),
      };
      existing.total_hours += Number(p.regular_hours ?? 0) + Number(p.ot_hours ?? 0);
      existing.days.add(p.date_for_payroll as string);
      empMap.set(p.employee_id, existing);
    }

    // Build result with projection
    const result = [...empMap.entries()].flatMap(([id, emp]) => {
      const days_worked   = emp.days.size;
      const avg_daily     = days_worked > 0 ? emp.total_hours / days_worked : 0;
      const projected_eow = emp.total_hours + avg_daily * remaining;

      // Filter: already in warning zone (35h+) OR projected to hit 38h+ by EOW
      if (emp.total_hours < 35 && projected_eow < 38) return [];

      return [{
        employee_id:      id,
        name:             emp.name,
        photo_url:        emp.photo_url,
        total_hours:      Math.round(emp.total_hours * 100) / 100,
        days_worked,
        avg_daily:        Math.round(avg_daily * 100) / 100,
        projected_eow:    Math.round(projected_eow * 100) / 100,
        remaining_weekdays: remaining,
      }];
    });

    // Sort: already OT → warning zone → projected-only; within group by hours desc
    result.sort((a, b) => {
      const rankA = a.total_hours >= 40 ? 0 : a.total_hours >= 35 ? 1 : 2;
      const rankB = b.total_hours >= 40 ? 0 : b.total_hours >= 35 ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return b.total_hours - a.total_hours;
    });

    return NextResponse.json({ week_start: weekStart, week_end: weekEnd, remaining_weekdays: remaining, members: result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
