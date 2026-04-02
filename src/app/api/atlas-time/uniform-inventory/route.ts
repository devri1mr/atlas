import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { estToday } from "@/lib/estTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET — fetch ledger entries (non-voided), newest first
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("at_uniform_inventory")
      .select(`
        id, transaction_type, quantity, unit_cost, total_cost,
        transaction_date, vendor_name, reference_number, notes,
        is_void, created_at,
        item_option_id,
        size_variant_id,
        color_variant_id,
        employee_id,
        at_field_options!item_option_id ( id, label ),
        size:at_uniform_variants!size_variant_id ( id, label ),
        color:at_uniform_variants!color_variant_id ( id, label ),
        employee:at_employees!employee_id ( id, first_name, last_name )
      `)
      .eq("company_id", companyId)
      .eq("is_void", false)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — create a new ledger entry (receipt only via this endpoint; issuances/returns come from employee profile)
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    const transaction_type = String(body.transaction_type ?? "receipt");
    const item_option_id   = String(body.item_option_id ?? "").trim();
    const quantity         = Number(body.quantity);

    if (!item_option_id)  return NextResponse.json({ error: "item_option_id required" }, { status: 400 });
    if (!quantity || isNaN(quantity)) return NextResponse.json({ error: "quantity required" }, { status: 400 });

    const unit_cost  = body.unit_cost  != null ? Number(body.unit_cost)  : null;
    const total_cost = body.total_cost != null ? Number(body.total_cost) : null;

    // Derive unit_cost from total/qty if not provided
    const resolvedUnitCost = unit_cost ?? (total_cost != null && quantity ? +(total_cost / quantity).toFixed(4) : null);
    const resolvedTotal    = total_cost ?? (resolvedUnitCost != null && quantity ? +(resolvedUnitCost * quantity).toFixed(2) : null);

    const { data, error } = await sb
      .from("at_uniform_inventory")
      .insert({
        company_id:         companyId,
        transaction_type,
        item_option_id,
        size_variant_id:    body.size_variant_id  || null,
        color_variant_id:   body.color_variant_id || null,
        quantity:           transaction_type === "issuance" ? -Math.abs(quantity) : Math.abs(quantity),
        unit_cost:          resolvedUnitCost,
        total_cost:         resolvedTotal,
        transaction_date:   body.transaction_date ?? estToday(),
        vendor_name:        body.vendor_name       || null,
        reference_number:   body.reference_number  || null,
        notes:              body.notes             || null,
        employee_id:        body.employee_id       || null,
        created_by_user_id: body.created_by_user_id || null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
