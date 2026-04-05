import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FERT_DIVISION_ID = "e710c6f9-d290-4004-8e55-303392eeb826";
const PAYROLL_BURDEN   = 1.15;

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("id");

    if (reportId) {
      // ── Detail view ─────────────────────────────────────────────────────────
      const { data: report, error } = await sb
        .from("fert_production_reports")
        .select(`
          id, report_date, file_name, imported_at, is_complete,
          total_budgeted_hours, total_actual_hours, total_budgeted_amount, total_actual_amount,
          fert_production_jobs (
            id, work_order, client_name, client_address, service, service_date, status,
            crew_code, budgeted_hours, real_budgeted_hours, actual_hours, variance_hours, budgeted_amount, actual_amount,
            fert_production_members (
              id, resource_name, resource_code, employee_id, actual_hours, earned_amount, punch_status,
              reg_hours, ot_hours, total_payroll_hours, pay_rate, payroll_cost
            )
          )
        `)
        .eq("id", reportId)
        .eq("company_id", company.id)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Fetch punches, usage, non-production days in parallel
      const [
        { data: punches },
        { data: usageRaw },
        { data: nonProd },
      ] = await Promise.all([
        sb.from("fert_report_punches")
          .select("employee_id, resource_name, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours")
          .eq("report_id", reportId)
          .order("clock_in_at", { ascending: true }),
        sb.from("inventory_transactions")
          .select(`id, material_id, quantity, unit_cost, total_cost, notes, employee_id, materials(display_name, name, unit, inventory_unit), at_employees(first_name, last_name)`)
          .eq("reference_type", "fert_production_report")
          .eq("reference_id", reportId)
          .eq("is_void", false)
          .order("created_at"),
        sb.from("fert_non_production_days")
          .select("*")
          .eq("report_id", reportId)
          .order("created_at"),
      ]);

      const usageEntries = (usageRaw ?? []).map((r: any) => {
        const emp  = r.at_employees as any;
        const memberName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : null;
        return {
          id:                   r.id,
          material_id:          r.material_id,
          name:                 r.materials?.display_name || r.materials?.name || "Unknown",
          unit:                 r.materials?.inventory_unit || r.materials?.unit || "",
          quantity:             Math.abs(Number(r.quantity)),
          unit_cost:            Number(r.unit_cost ?? 0),
          total_cost:           Math.abs(Number(r.total_cost ?? 0)),
          notes:                r.notes ?? null,
          employee_id:          r.employee_id ?? null,
          assigned_member_name: memberName ?? null,
        };
      });

      // Compute unmatched punches (fert punches on that date not in production or non-prod)
      const prodEmpIds = new Set<string>();
      for (const job of (report as any)?.fert_production_jobs ?? []) {
        for (const m of job.fert_production_members ?? []) {
          if (m.employee_id) prodEmpIds.add(m.employee_id);
        }
      }
      const nonProdEmpIds = new Set<string>(
        (nonProd ?? []).map((r: any) => r.employee_id).filter(Boolean)
      );
      const accountedIds = new Set([...prodEmpIds, ...nonProdEmpIds]);

      const { data: allPunches } = await sb
        .from("at_punches")
        .select("employee_id, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours")
        .eq("division_id", FERT_DIVISION_ID)
        .eq("date_for_payroll", (report as any).report_date)
        .not("clock_out_at", "is", null);

      const rawUnmatched = (allPunches ?? []).filter(
        (p: any) => p.employee_id && !accountedIds.has(p.employee_id)
      );

      let unmatchedPunches: any[] = [];
      if (rawUnmatched.length > 0) {
        const ids = rawUnmatched.map((p: any) => p.employee_id);
        const [{ data: emps }, { data: rates }] = await Promise.all([
          sb.from("at_employees").select("id, first_name, last_name, default_pay_rate").in("id", ids),
          sb.from("at_pay_rates").select("employee_id, rate, is_default").in("employee_id", ids),
        ]);

        const empMap  = new Map((emps ?? []).map((e: any) => [e.id, e]));
        const rateMap = new Map<string, number>();
        for (const e of emps ?? []) rateMap.set(e.id, Number(e.default_pay_rate ?? 0));
        for (const r of rates ?? []) { if (r.is_default) rateMap.set(r.employee_id, Number(r.rate)); }

        unmatchedPunches = rawUnmatched.map((p: any) => {
          const emp  = empMap.get(p.employee_id) as any;
          const name = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : p.employee_id;
          const rate = rateMap.get(p.employee_id) ?? 0;
          const hrs  = Number(p.regular_hours ?? 0) + Number(p.ot_hours ?? 0) + Number(p.dt_hours ?? 0);
          return {
            employee_id:   p.employee_id,
            resource_name: name,
            clock_in_at:   p.clock_in_at,
            clock_out_at:  p.clock_out_at,
            reg_hours:     Number(p.regular_hours ?? 0),
            ot_hours:      Number(p.ot_hours ?? 0),
            total_hours:   hrs,
            pay_rate:      rate,
            payroll_cost:  Math.round(hrs * rate * PAYROLL_BURDEN * 100) / 100,
          };
        });
      }

      return NextResponse.json({
        data: report,
        punches:          punches ?? [],
        usage:            usageEntries,
        non_production:   nonProd ?? [],
        unmatched_punches: unmatchedPunches,
      });
    }

    // ── List view ──────────────────────────────────────────────────────────────
    const { data, error } = await sb
      .from("fert_production_reports")
      .select(`
        id, report_date, file_name, imported_at, is_complete,
        total_budgeted_hours, total_actual_hours, total_budgeted_amount, total_actual_amount,
        fert_production_jobs ( fert_production_members ( employee_id, resource_name, payroll_cost, earned_amount ) )
      `)
      .eq("company_id", company.id)
      .order("report_date", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const reportIds = (data ?? []).map((r: any) => r.id);

    // Batch-fetch material costs and non-prod costs
    const [{ data: materialRows }, { data: nonProdRows }] = await Promise.all([
      reportIds.length > 0
        ? sb.from("inventory_transactions")
            .select("reference_id, total_cost")
            .eq("reference_type", "fert_production_report")
            .in("reference_id", reportIds)
            .eq("is_void", false)
        : Promise.resolve({ data: [] }),
      reportIds.length > 0
        ? sb.from("fert_non_production_days")
            .select("report_id, payroll_cost")
            .in("report_id", reportIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Aggregate per report
    const matCostMap   = new Map<string, number>();
    const nonProdMap   = new Map<string, number>();
    for (const r of materialRows ?? []) {
      matCostMap.set(r.reference_id, (matCostMap.get(r.reference_id) ?? 0) + Math.abs(Number(r.total_cost ?? 0)));
    }
    for (const r of nonProdRows ?? []) {
      nonProdMap.set(r.report_id, (nonProdMap.get(r.report_id) ?? 0) + Number(r.payroll_cost ?? 0));
    }

    const reports = (data ?? []).map((r: any) => {
      const seen = new Set<string>();
      let totalPayrollCost  = 0;
      let totalEarnedAmount = 0;
      for (const job of r.fert_production_jobs ?? []) {
        for (const m of job.fert_production_members ?? []) {
          totalEarnedAmount += m.earned_amount ?? 0;
          const key = m.employee_id ?? m.resource_name ?? "";
          if (key && !seen.has(key)) {
            seen.add(key);
            totalPayrollCost += m.payroll_cost ?? 0;
          }
        }
      }
      const { fert_production_jobs: _, ...rest } = r;
      return {
        ...rest,
        total_payroll_cost:    totalPayrollCost,
        total_earned_amount:   totalEarnedAmount,
        total_material_cost:   matCostMap.get(r.id)   ?? 0,
        total_non_prod_cost:   nonProdMap.get(r.id)   ?? 0,
      };
    });

    return NextResponse.json({ data: reports });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("fert_production_reports")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PATCH — toggle is_complete
export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { id, is_complete } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("fert_production_reports")
      .update({ is_complete: !!is_complete })
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
