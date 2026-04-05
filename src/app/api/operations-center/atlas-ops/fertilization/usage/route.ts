import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FERT_DIVISION_ID   = "e710c6f9-d290-4004-8e55-303392eeb826";
const SAGINAW_SHOP_ID    = "837abb64-e7b9-4de9-b253-d9846551e35e";
const PAYROLL_BURDEN     = 1.15; // kept for reference parity

// GET ?report_id=xxx  — fetch usage entries for a report
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const reportId = new URL(req.url).searchParams.get("report_id");
    if (!reportId) return NextResponse.json({ error: "report_id required" }, { status: 400 });

    const { data, error } = await sb
      .from("inventory_transactions")
      .select(`
        id, material_id, quantity, unit_cost, total_cost, notes, transaction_date,
        employee_id,
        materials ( display_name, name, unit, inventory_unit ),
        at_employees ( first_name, last_name )
      `)
      .eq("reference_type", "fert_production_report")
      .eq("reference_id", reportId)
      .eq("is_void", false)
      .order("created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entries = (data ?? []).map((r: any) => {
      const emp  = r.at_employees as any;
      const name = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : null;
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
        assigned_member_name: name ?? null,
      };
    });

    return NextResponse.json({ data: entries });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — log a material usage entry for a report
// body: { report_id, report_date, material_id, quantity, unit_cost?, notes? }
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body        = await req.json().catch(() => ({}));
    const report_id   = String(body.report_id  ?? "").trim();
    const report_date = String(body.report_date ?? "").trim();
    const material_id = String(body.material_id ?? "").trim();
    const quantity    = Math.abs(Number(body.quantity ?? 0));
    const notes       = body.notes ? String(body.notes).trim() : null;
    const employee_id = body.employee_id ? String(body.employee_id).trim() : null;

    if (!report_id || !material_id || quantity <= 0) {
      return NextResponse.json({ error: "report_id, material_id, and quantity > 0 required" }, { status: 400 });
    }

    // Determine unit_cost — use provided or compute avg from receipts/carryovers
    let unitCost: number = body.unit_cost != null ? Number(body.unit_cost) : -1;

    if (unitCost < 0) {
      const { data: invRows } = await sb
        .from("inventory_transactions")
        .select("transaction_type, quantity, unit_cost")
        .eq("material_id", material_id)
        .eq("division_id", FERT_DIVISION_ID)
        .eq("is_void", false);

      let totalQty = 0, totalCost = 0;
      for (const r of invRows ?? []) {
        if ((r.transaction_type === "receipt" || r.transaction_type === "carryover") && r.unit_cost != null) {
          const q = Math.abs(Number(r.quantity));
          totalQty  += q;
          totalCost += q * Number(r.unit_cost);
        }
      }
      unitCost = totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 0;
    }

    const totalCost = Math.round(unitCost * quantity * 100) / 100;

    const { data: inserted, error } = await sb
      .from("inventory_transactions")
      .insert({
        company_id:       company.id,
        material_id,
        location_id:      SAGINAW_SHOP_ID,
        transaction_type: "usage",
        quantity:         -quantity,        // negative = out of inventory
        unit_cost:        unitCost,
        total_cost:       -totalCost,
        transaction_date: report_date || new Date().toISOString().slice(0, 10),
        division_id:      FERT_DIVISION_ID,
        reference_type:   "fert_production_report",
        reference_id:     report_id,
        invoiced_final:   false,
        is_void:          false,
        notes,
        employee_id:      employee_id || null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      id:         inserted.id,
      material_id,
      quantity,
      unit_cost:  unitCost,
      total_cost: totalCost,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PATCH { id, quantity?, unit_cost?, notes?, employee_id? } — update a usage entry
export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body      = await req.json().catch(() => ({}));
    const { id, quantity, unit_cost, notes, employee_id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (quantity  != null) {
      const q = Math.abs(Number(quantity));
      updates.quantity   = -q;
      if (unit_cost != null) {
        updates.unit_cost  = Number(unit_cost);
        updates.total_cost = -(Math.round(q * Number(unit_cost) * 100) / 100);
      } else {
        // Recompute total_cost from existing unit_cost
        const { data: existing } = await sb.from("inventory_transactions").select("unit_cost").eq("id", id).single();
        const uc = Number(existing?.unit_cost ?? 0);
        updates.total_cost = -(Math.round(q * uc * 100) / 100);
      }
    } else if (unit_cost != null) {
      updates.unit_cost = Number(unit_cost);
      const { data: existing } = await sb.from("inventory_transactions").select("quantity").eq("id", id).single();
      const q = Math.abs(Number(existing?.quantity ?? 0));
      updates.total_cost = -(Math.round(q * Number(unit_cost) * 100) / 100);
    }
    if (notes       !== undefined) updates.notes       = notes ?? null;
    if (employee_id !== undefined) updates.employee_id = employee_id ?? null;

    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

    const { error } = await sb.from("inventory_transactions").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE ?id=  — void a usage entry
export async function DELETE(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("inventory_transactions")
      .update({ is_void: true, void_reason: "removed from production close-out" })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
