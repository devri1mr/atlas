import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = supabaseAdmin();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const in90 = new Date(today); in90.setDate(in90.getDate() + 90);
  const in30Str = in30.toISOString().split("T")[0];
  const in90Str = in90.toISOString().split("T")[0];

  // ── Fetch all active employees ────────────────────────────────────
  const { data: employees, error } = await supabase
    .from("at_employees")
    .select(`
      id, first_name, last_name,
      hire_date, date_of_birth, status,
      photo_url, emergency_contact_name, i9_on_file,
      kiosk_pin, phone, department_id,
      drivers_license_expiration, dot_card_expiration,
      fert_license_expiration, cpr_expiration, first_aid_expiration
    `)
    .eq("status", "active");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const emps = employees ?? [];

  // ── Retention Tracker ─────────────────────────────────────────────
  const bands = { lt1: 0, yr1_2: 0, yr2_5: 0, yr5_10: 0, yr10plus: 0 };
  let newThisMonth = 0;
  const criticalZone: { name: string; months: number }[] = [];

  for (const e of emps) {
    if (!e.hire_date) continue;
    const hire = new Date(e.hire_date);
    const diffDays = (today.getTime() - hire.getTime()) / 86400000;
    const diffMonths = diffDays / 30.44;
    const diffYears = diffDays / 365.25;

    if (diffYears < 1) bands.lt1++;
    else if (diffYears < 2) bands.yr1_2++;
    else if (diffYears < 5) bands.yr2_5++;
    else if (diffYears < 10) bands.yr5_10++;
    else bands.yr10plus++;

    if (hire.getFullYear() === currentYear && hire.getMonth() + 1 === currentMonth) newThisMonth++;

    for (const mark of [3, 6, 9]) {
      if (Math.abs(diffMonths - mark) <= 0.5) {
        criticalZone.push({ name: `${e.first_name} ${e.last_name}`, months: Math.round(diffMonths * 10) / 10 });
        break;
      }
    }
  }

  // ── Compliance Alerts ─────────────────────────────────────────────
  type ComplianceAlert = { name: string; type: string; expiry: string; severity: "expired" | "urgent" | "warning" };
  const complianceAlerts: ComplianceAlert[] = [];

  const licFields: { key: string; label: string }[] = [
    { key: "drivers_license_expiration", label: "Driver's License" },
    { key: "dot_card_expiration",        label: "DOT Card" },
    { key: "fert_license_expiration",    label: "Fert License" },
    { key: "cpr_expiration",             label: "CPR" },
    { key: "first_aid_expiration",       label: "First Aid" },
  ];

  for (const e of emps) {
    for (const { key, label } of licFields) {
      const val = (e as Record<string, unknown>)[key] as string | null;
      if (!val) continue;
      let severity: ComplianceAlert["severity"] | null = null;
      if (val <= todayStr)  severity = "expired";
      else if (val <= in30Str) severity = "urgent";
      else if (val <= in90Str) severity = "warning";
      if (severity) complianceAlerts.push({ name: `${e.first_name} ${e.last_name}`, type: label, expiry: val, severity });
    }
  }
  const sevOrder = { expired: 0, urgent: 1, warning: 2 };
  complianceAlerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.expiry.localeCompare(b.expiry));

  // ── Anniversaries (this month) ────────────────────────────────────
  const anniversaries = emps
    .filter(e => e.hire_date && new Date(e.hire_date).getMonth() + 1 === currentMonth)
    .map(e => {
      const hire = new Date(e.hire_date!);
      return { name: `${e.first_name} ${e.last_name}`, hire_date: e.hire_date, years: currentYear - hire.getFullYear(), day: hire.getDate() };
    })
    .filter(e => e.years > 0)
    .sort((a, b) => a.day - b.day);

  // ── Birthdays (this month) ────────────────────────────────────────
  const birthdays = emps
    .filter(e => e.date_of_birth && new Date(e.date_of_birth).getMonth() + 1 === currentMonth)
    .map(e => {
      const dob = new Date(e.date_of_birth!);
      return { name: `${e.first_name} ${e.last_name}`, date_of_birth: e.date_of_birth, age: currentYear - dob.getFullYear(), day: dob.getDate() };
    })
    .sort((a, b) => a.day - b.day);

  // ── Hiring Velocity (last 13 months) ─────────────────────────────
  const { data: allEmps } = await supabase
    .from("at_employees")
    .select("hire_date, status")
    .not("hire_date", "is", null);

  const velocityMap: Record<string, { hired: number; still_active: number }> = {};
  const cutoff = new Date(currentYear, currentMonth - 14, 1);
  for (const e of allEmps ?? []) {
    if (!e.hire_date) continue;
    const hire = new Date(e.hire_date);
    if (hire < cutoff) continue;
    const key = `${hire.getFullYear()}-${String(hire.getMonth() + 1).padStart(2, "0")}`;
    if (!velocityMap[key]) velocityMap[key] = { hired: 0, still_active: 0 };
    velocityMap[key].hired++;
    if (e.status === "active") velocityMap[key].still_active++;
  }

  const hiringVelocity = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
    hiringVelocity.push({ month: label, key, hired: velocityMap[key]?.hired ?? 0, still_active: velocityMap[key]?.still_active ?? 0 });
  }

  // ── Workforce Completeness ────────────────────────────────────────
  const total = emps.length;
  const completeness = {
    total,
    photo:             emps.filter(e => e.photo_url).length,
    emergency_contact: emps.filter(e => e.emergency_contact_name).length,
    i9:                emps.filter(e => e.i9_on_file).length,
    kiosk_pin:         emps.filter(e => e.kiosk_pin).length,
    dob:               emps.filter(e => e.date_of_birth).length,
    phone:             emps.filter(e => e.phone).length,
    department:        emps.filter(e => e.department_id).length,
  };

  // ── PTO Status ────────────────────────────────────────────────────
  const { data: ptoBalances } = await supabase
    .from("at_pto_balances")
    .select("accrued_hours, used_hours")
    .eq("year", currentYear);

  const ptoSummary = (ptoBalances ?? []).reduce(
    (acc, b) => ({ total_accrued: acc.total_accrued + (b.accrued_hours ?? 0), total_used: acc.total_used + (b.used_hours ?? 0) }),
    { total_accrued: 0, total_used: 0 }
  );

  const { data: ptoPending } = await supabase
    .from("at_pto_requests")
    .select("id, employee_id, hours_requested, start_date")
    .eq("status", "pending");

  return NextResponse.json({
    as_of: todayStr,
    current_month: today.toLocaleString("en-US", { month: "long" }),
    current_year: currentYear,
    total_active: emps.length,
    retention:         { bands, new_this_month: newThisMonth, critical_zone: criticalZone },
    compliance_alerts: complianceAlerts,
    anniversaries,
    birthdays,
    hiring_velocity:   hiringVelocity,
    completeness,
    pto: { ...ptoSummary, pending_count: (ptoPending ?? []).length },
  });
}
