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
 *
 * On Hand = inventory ledger qty  (receipts positive, issuances negative)
 *         − legacy employee items (those in uniform_items JSONB without an
 *           inventory_id, meaning they predate the inventory system and have
 *           no corresponding ledger entry)
 *
 * This means items issued before the ledger existed appear as negative on-hand,
 * correctly reflecting that stock was given out with no recorded receipt.
 */
export async function GET(_req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const [ledgerRes, empRes] = await Promise.all([
      sb
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
        .eq("is_void", false),
      sb
        .from("at_employees")
        .select("uniform_items")
        .eq("company_id", companyId)
        .neq("status", "terminated"),
    ]);

    if (ledgerRes.error) return NextResponse.json({ error: ledgerRes.error.message }, { status: 500 });

    // ── 1. Aggregate inventory ledger ─────────────────────────────────────────
    const map = new Map<string, {
      item_name: string;
      size_label: string | null;
      color_label: string | null;
      qty_on_hand: number;
      total_receipt_qty: number;
      total_receipt_cost: number;
      legacy_total_qty: number;   // qty from employee JSONB (no inventory_id)
      legacy_total_cost: number;  // cost from employee JSONB (fallback when no receipts)
    }>();

    for (const row of ledgerRes.data ?? []) {
      const itemOpt  = row.at_field_options as any;
      const sizeVar  = row.size as any;
      const colorVar = row.color as any;

      const item_name  = itemOpt?.label  ?? "Unknown";
      const size_label = sizeVar?.label  ?? null;
      const color_label = colorVar?.label ?? null;
      const key = `${item_name}|${size_label ?? ""}|${color_label ?? ""}`;

      if (!map.has(key)) {
        map.set(key, { item_name, size_label, color_label, qty_on_hand: 0, total_receipt_qty: 0, total_receipt_cost: 0, legacy_total_qty: 0, legacy_total_cost: 0 });
      }

      const entry = map.get(key)!;
      entry.qty_on_hand += row.quantity; // receipts positive, issuances negative

      if (row.transaction_type === "receipt" && row.unit_cost != null) {
        entry.total_receipt_qty  += Math.abs(row.quantity);
        entry.total_receipt_cost += Math.abs(row.quantity) * Number(row.unit_cost);
      }
    }

    // ── 2. Subtract legacy employee items (no inventory_id = not in ledger) ───
    for (const emp of empRes.data ?? []) {
      const items: any[] = Array.isArray(emp.uniform_items) ? emp.uniform_items : [];
      for (const ui of items) {
        // Skip items already tracked via the inventory system
        if (ui.inventory_id) continue;

        const item_name   = (ui.item  ?? "").trim();
        const size_label  = (ui.size  ?? "").trim() || null;
        const color_label = (ui.color ?? "").trim() || null;
        const qty         = Number(ui.qty ?? 1);
        if (!item_name) continue;

        const cost = ui.cost != null ? Number(ui.cost) : null;

        const key = `${item_name}|${size_label ?? ""}|${color_label ?? ""}`;
        if (!map.has(key)) {
          map.set(key, { item_name, size_label, color_label, qty_on_hand: 0, total_receipt_qty: 0, total_receipt_cost: 0, legacy_total_qty: 0, legacy_total_cost: 0 });
        }
        const entry = map.get(key)!;
        entry.qty_on_hand -= qty; // issued out, no receipt → deficit
        if (cost != null) {
          entry.legacy_total_qty  += qty;
          entry.legacy_total_cost += qty * cost;
        }
      }
    }

    // ── 3. Build response ─────────────────────────────────────────────────────
    const summary = Array.from(map.values()).map(e => ({
      item_name:       e.item_name,
      size_label:      e.size_label,
      color_label:     e.color_label,
      qty_on_hand:     e.qty_on_hand,
      avg_unit_cost: (() => {
        if (e.total_receipt_qty > 0)
          return Math.round((e.total_receipt_cost / e.total_receipt_qty) * 100) / 100;
        if (e.legacy_total_qty > 0)
          return Math.round((e.legacy_total_cost / e.legacy_total_qty) * 100) / 100;
        return null;
      })(),
      inventory_value: (() => {
        const avgCost = e.total_receipt_qty > 0
          ? e.total_receipt_cost / e.total_receipt_qty
          : e.legacy_total_qty > 0
            ? e.legacy_total_cost / e.legacy_total_qty
            : null;
        return avgCost != null
          ? Math.round(e.qty_on_hand * avgCost * 100) / 100
          : null;
      })(),
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
