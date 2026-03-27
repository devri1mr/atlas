import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

/**
 * Returns qty_on_hand and avg_unit_cost grouped by item + size + color.
 * Uses weighted average cost across all non-voided receipt entries.
 */
export async function GET(_req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("at_uniform_inventory")
      .select(`
        transaction_type, quantity, unit_cost,
        item_option_id,
        size_variant_id,
        color_variant_id,
        at_field_options!item_option_id ( id, label ),
        size:at_uniform_variants!size_variant_id ( id, label ),
        color:at_uniform_variants!color_variant_id ( id, label )
      `)
      .eq("company_id", companyId)
      .eq("is_void", false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aggregate in JS: group by item+size+color
    const map = new Map<string, {
      item_option_id: string;
      item_name: string;
      size_variant_id: string | null;
      size_label: string | null;
      color_variant_id: string | null;
      color_label: string | null;
      qty_on_hand: number;
      total_receipt_qty: number;
      total_receipt_cost: number;
    }>();

    for (const row of data ?? []) {
      const itemOpt = row.at_field_options as any;
      const sizeVar = row.size as any;
      const colorVar = row.color as any;

      const key = `${row.item_option_id}|${row.size_variant_id ?? ""}|${row.color_variant_id ?? ""}`;

      if (!map.has(key)) {
        map.set(key, {
          item_option_id:   row.item_option_id,
          item_name:        itemOpt?.label ?? "Unknown",
          size_variant_id:  row.size_variant_id ?? null,
          size_label:       sizeVar?.label ?? null,
          color_variant_id: row.color_variant_id ?? null,
          color_label:      colorVar?.label ?? null,
          qty_on_hand:         0,
          total_receipt_qty:   0,
          total_receipt_cost:  0,
        });
      }

      const entry = map.get(key)!;
      entry.qty_on_hand += row.quantity; // negative for issuances

      // Track cost basis from receipts only (for avg cost calculation)
      if (row.transaction_type === "receipt" && row.unit_cost != null) {
        entry.total_receipt_qty  += Math.abs(row.quantity);
        entry.total_receipt_cost += Math.abs(row.quantity) * Number(row.unit_cost);
      }
    }

    const summary = Array.from(map.values()).map(e => ({
      item_option_id:   e.item_option_id,
      item_name:        e.item_name,
      size_variant_id:  e.size_variant_id,
      size_label:       e.size_label,
      color_variant_id: e.color_variant_id,
      color_label:      e.color_label,
      qty_on_hand:      e.qty_on_hand,
      avg_unit_cost:    e.total_receipt_qty > 0
        ? Math.round((e.total_receipt_cost / e.total_receipt_qty) * 100) / 100
        : null,
      inventory_value:  e.qty_on_hand > 0 && e.total_receipt_qty > 0
        ? Math.round(e.qty_on_hand * (e.total_receipt_cost / e.total_receipt_qty) * 100) / 100
        : null,
    })).sort((a, b) =>
      a.item_name.localeCompare(b.item_name) ||
      (a.size_label ?? "").localeCompare(b.size_label ?? "") ||
      (a.color_label ?? "").localeCompare(b.color_label ?? "")
    );

    return NextResponse.json({ summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
