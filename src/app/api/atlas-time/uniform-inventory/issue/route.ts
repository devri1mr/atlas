import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { nextPaycheckDate, PayPeriodSettings } from "@/lib/atPayPeriod";
import { estToday } from "@/lib/estTime";

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

    const body             = await req.json().catch(() => ({}));
    const employee_id      = String(body.employee_id       ?? "").trim();
    const item_option_id   = body.item_option_id ? String(body.item_option_id).trim() : null;
    const manual_item_label= body.manual_item_label ? String(body.manual_item_label).trim() : null;
    const quantity         = Math.abs(Number(body.quantity ?? 1));
    const issue_date       = String(body.issue_date ?? estToday());
    const issued_type      = String(body.issued_type ?? "company_issued");
    const item_label       = item_option_id ? String(body.item_label ?? "") : (manual_item_label ?? "");
    const size_label       = body.size_label   ? String(body.size_label)   : null;
    const color_label      = body.color_label  ? String(body.color_label)  : null;
    const size_variant_id  = body.size_variant_id  || null;
    const color_variant_id = body.color_variant_id || null;
    const override_cost    = body.unit_cost != null ? Number(body.unit_cost) : null;
    const isManual         = !item_option_id && !!manual_item_label;

    if (!employee_id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });
    if (!item_option_id && !manual_item_label) return NextResponse.json({ error: "item_option_id or manual_item_label required" }, { status: 400 });

    // ── 1. Look up avg_unit_cost from inventory (inventory mode only) ─────────
    let unitCost: number | null = override_cost;
    let inventory_id: string | null = null;

    if (!isManual && item_option_id) {
      if (unitCost == null) {
        let invQuery = sb
          .from("at_uniform_inventory")
          .select("transaction_type, quantity, unit_cost")
          .eq("company_id", companyId)
          .eq("item_option_id", item_option_id)
          .eq("is_void", false);
        if (size_variant_id)  invQuery = invQuery.eq("size_variant_id",  size_variant_id);
        else                  invQuery = invQuery.is("size_variant_id",  null);
        if (color_variant_id) invQuery = invQuery.eq("color_variant_id", color_variant_id);
        else                  invQuery = invQuery.is("color_variant_id", null);

        const { data: invRows } = await invQuery;
        let totalReceiptQty = 0, totalReceiptCost = 0;
        for (const r of invRows ?? []) {
          if (r.transaction_type === "receipt" && r.unit_cost != null) {
            totalReceiptQty  += Math.abs(r.quantity);
            totalReceiptCost += Math.abs(r.quantity) * Number(r.unit_cost);
          }
        }
        unitCost = totalReceiptQty > 0 ? Math.round((totalReceiptCost / totalReceiptQty) * 100) / 100 : null;
      }

      // ── 2. Create inventory issuance entry ──────────────────────────────────
      const { data: invEntry, error: invErr } = await sb
        .from("at_uniform_inventory")
        .insert({
          company_id:       companyId,
          transaction_type: "issuance",
          item_option_id,
          size_variant_id,
          color_variant_id,
          quantity:         -quantity,
          unit_cost:        unitCost,
          total_cost:       unitCost != null ? +(unitCost * quantity).toFixed(2) : null,
          transaction_date: issue_date,
          employee_id,
        })
        .select("id")
        .single();

      if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
      inventory_id = invEntry.id;
    }

    // ── 3. For team_member_purchase: create deduction(s) + reimbursement(s) ────
    let schedule: { deduction_id: string; deduction_date: string; amount: number; reimbursement_id: string | null; reimbursement_date: string | null }[] = [];

    if (issued_type === "team_member_purchase" && unitCost != null) {
      const totalCharge = +(unitCost * quantity).toFixed(2);
      const split       = Math.max(1, Math.min(26, Number(body.split_checks ?? 1)));

      // Fetch pay period settings
      const { data: gs } = await sb
        .from("at_settings")
        .select("pay_cycle, payday_day_of_week, pay_period_start_day, pay_period_anchor_date")
        .eq("company_id", companyId)
        .maybeSingle();

      const paySettings: PayPeriodSettings = {
        pay_cycle:              gs?.pay_cycle              ?? "weekly",
        payday_day_of_week:     gs?.payday_day_of_week     ?? 5,
        pay_period_start_day:   gs?.pay_period_start_day   ?? 1,
        pay_period_anchor_date: gs?.pay_period_anchor_date ?? null,
      };

      // Per-check amounts — cents-precise, remainder on last check
      const perCheck     = Math.floor(totalCharge * 100 / split) / 100;
      const lastAmt      = +((totalCharge - perCheck * (split - 1)).toFixed(2));

      const baseDate     = new Date(issue_date + "T12:00:00");
      const parts        = [item_label, size_label, color_label].filter(Boolean);
      const baseDesc     = `${parts.join(" · ")} × ${quantity}`;

      // Build and insert deductions (sequential paycheck dates)
      const dedInserts = Array.from({ length: split }, (_, i) => ({
        company_id:          companyId,
        employee_id,
        type:                "deduction",
        category:            "uniform",
        description:         split > 1 ? `${baseDesc} (${i + 1}/${split})` : baseDesc,
        amount:              i === split - 1 ? lastAmt : perCheck,
        paycheck_date:       nextPaycheckDate(paySettings, baseDate, i),
        status:              "pending",
        source_inventory_id: inventory_id,
      }));

      const { data: insertedDeds } = await sb.from("at_pay_adjustments").insert(dedInserts).select("id, paycheck_date, amount");

      // Build and insert reimbursements (90 days from each deduction paycheck date)
      const reimInserts = (insertedDeds ?? []).map((d: any, i: number) => {
        const reimFrom = new Date(d.paycheck_date + "T12:00:00");
        reimFrom.setDate(reimFrom.getDate() + 90);
        return {
          company_id:          companyId,
          employee_id,
          type:                "reimbursement",
          category:            "uniform",
          description:         split > 1 ? `${baseDesc} (${i + 1}/${split})` : baseDesc,
          amount:              d.amount,
          paycheck_date:       nextPaycheckDate(paySettings, reimFrom),
          status:              "pending",
          source_inventory_id: inventory_id,
        };
      });

      const { data: insertedReims } = await sb.from("at_pay_adjustments").insert(reimInserts).select("id, paycheck_date, amount");

      // Link each reimbursement back to its deduction
      if (insertedDeds && insertedReims) {
        await Promise.all(insertedDeds.map((d: any, i: number) =>
          insertedReims[i]
            ? sb.from("at_pay_adjustments").update({ reimburses_adjustment_id: d.id }).eq("id", insertedReims[i].id)
            : Promise.resolve()
        ));
      }

      schedule = (insertedDeds ?? []).map((d: any, i: number) => ({
        deduction_id:       d.id,
        deduction_date:     d.paycheck_date,
        amount:             d.amount,
        reimbursement_id:   insertedReims?.[i]?.id   ?? null,
        reimbursement_date: insertedReims?.[i]?.paycheck_date ?? null,
      }));
    }

    return NextResponse.json({
      inventory_id,
      unit_cost:                   unitCost,
      schedule,
      // Legacy single-entry fields for backwards compat (employee profile page)
      deduction_id:                schedule[0]?.deduction_id       ?? null,
      reimbursement_id:            schedule[0]?.reimbursement_id   ?? null,
      deduction_paycheck_date:     schedule[0]?.deduction_date     ?? null,
      reimbursement_paycheck_date: schedule[0]?.reimbursement_date ?? null,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
