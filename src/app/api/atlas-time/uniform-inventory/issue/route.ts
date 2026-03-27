import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { nextPaycheckDate } from "@/lib/atPayPeriod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

/**
 * POST — issue a uniform item to an employee.
 * Atomically:
 *   1. Creates an inventory issuance entry (decrements stock)
 *   2. For team_member_purchase: creates a deduction (next paycheck)
 *      and a scheduled reimbursement (90 days from issue_date)
 *
 * Body:
 *   employee_id, item_option_id, size_variant_id?, color_variant_id?,
 *   quantity, issue_date, issued_type ("company_issued" | "team_member_purchase"),
 *   item_label, size_label?, color_label?
 *
 * Returns:
 *   inventory_id, unit_cost, deduction_id?, reimbursement_id?,
 *   deduction_paycheck_date?, reimbursement_paycheck_date?
 */
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body        = await req.json().catch(() => ({}));
    const employee_id     = String(body.employee_id      ?? "").trim();
    const item_option_id  = String(body.item_option_id   ?? "").trim();
    const quantity        = Math.abs(Number(body.quantity ?? 1));
    const issue_date      = String(body.issue_date        ?? new Date().toISOString().slice(0, 10));
    const issued_type     = String(body.issued_type       ?? "company_issued");
    const item_label      = String(body.item_label        ?? "");
    const size_label      = body.size_label  ? String(body.size_label)  : null;
    const color_label     = body.color_label ? String(body.color_label) : null;
    const size_variant_id = body.size_variant_id  || null;
    const color_variant_id= body.color_variant_id || null;

    if (!employee_id)    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
    if (!item_option_id) return NextResponse.json({ error: "item_option_id required" }, { status: 400 });

    // ── 1. Look up avg_unit_cost from inventory summary ───────────────────────
    let invQuery = sb
      .from("at_uniform_inventory")
      .select("transaction_type, quantity, unit_cost")
      .eq("company_id", companyId)
      .eq("item_option_id", item_option_id)
      .eq("is_void", false);

    // Supabase .eq(col, null) matches nothing — use .is() for null checks
    if (size_variant_id)  invQuery = invQuery.eq("size_variant_id",  size_variant_id);
    else                  invQuery = invQuery.is("size_variant_id",  null);
    if (color_variant_id) invQuery = invQuery.eq("color_variant_id", color_variant_id);
    else                  invQuery = invQuery.is("color_variant_id", null);

    const { data: invRows } = await invQuery;

    // Compute weighted avg cost from receipts
    let totalReceiptQty  = 0;
    let totalReceiptCost = 0;
    for (const r of invRows ?? []) {
      if (r.transaction_type === "receipt" && r.unit_cost != null) {
        totalReceiptQty  += Math.abs(r.quantity);
        totalReceiptCost += Math.abs(r.quantity) * Number(r.unit_cost);
      }
    }
    const unitCost = totalReceiptQty > 0
      ? Math.round((totalReceiptCost / totalReceiptQty) * 100) / 100
      : null;

    // ── 2. Create inventory issuance ─────────────────────────────────────────
    const { data: invEntry, error: invErr } = await sb
      .from("at_uniform_inventory")
      .insert({
        company_id:       companyId,
        transaction_type: "issuance",
        item_option_id,
        size_variant_id,
        color_variant_id,
        quantity:         -quantity,  // negative = stock out
        unit_cost:        unitCost,
        total_cost:       unitCost != null ? +(unitCost * quantity).toFixed(2) : null,
        transaction_date: issue_date,
        employee_id,
      })
      .select("id")
      .single();

    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
    const inventory_id = invEntry.id;

    // ── 3. For team_member_purchase: create deduction + reimbursement ─────────
    let deduction_id:           string | null = null;
    let reimbursement_id:       string | null = null;
    let deduction_paycheck:     string | null = null;
    let reimbursement_paycheck: string | null = null;

    if (issued_type === "team_member_purchase" && unitCost != null) {
      const totalCharge = +(unitCost * quantity).toFixed(2);

      // Fetch pay period settings
      const { data: gs } = await sb
        .from("at_settings")
        .select("pay_cycle, payday_day_of_week, pay_period_anchor_date")
        .eq("company_id", companyId)
        .maybeSingle();

      const paySettings = {
        pay_cycle:              gs?.pay_cycle              ?? "weekly",
        payday_day_of_week:     gs?.payday_day_of_week     ?? 5,
        pay_period_anchor_date: gs?.pay_period_anchor_date ?? null,
      };

      deduction_paycheck     = nextPaycheckDate(paySettings, new Date());
      const issueDateObj     = new Date(issue_date + "T12:00:00");
      issueDateObj.setDate(issueDateObj.getDate() + 90);
      reimbursement_paycheck = nextPaycheckDate(paySettings, issueDateObj);

      // Build shared description
      const parts = [item_label, size_label, color_label].filter(Boolean);
      const desc  = `${parts.join(" · ")} × ${quantity}`;

      const [dedRes, reimRes] = await Promise.all([
        sb.from("at_pay_adjustments").insert({
          company_id:         companyId,
          employee_id,
          type:               "deduction",
          category:           "uniform",
          description:        desc,
          amount:             totalCharge,
          paycheck_date:      deduction_paycheck,
          status:             "pending",
          source_inventory_id: inventory_id,
        }).select("id").single(),
        sb.from("at_pay_adjustments").insert({
          company_id:         companyId,
          employee_id,
          type:               "reimbursement",
          category:           "uniform",
          description:        desc,
          amount:             totalCharge,
          paycheck_date:      reimbursement_paycheck,
          status:             "pending",
          source_inventory_id: inventory_id,
        }).select("id").single(),
      ]);

      deduction_id     = dedRes.data?.id ?? null;
      reimbursement_id = reimRes.data?.id ?? null;

      // Link reimbursement back to deduction
      if (deduction_id && reimbursement_id) {
        await sb.from("at_pay_adjustments")
          .update({ reimburses_adjustment_id: deduction_id })
          .eq("id", reimbursement_id);
      }
    }

    return NextResponse.json({
      inventory_id,
      unit_cost:                  unitCost,
      deduction_id,
      reimbursement_id,
      deduction_paycheck_date:    deduction_paycheck,
      reimbursement_paycheck_date: reimbursement_paycheck,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
