import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET — returns last two snapshots + consumption report comparing them
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data: snapshots, error } = await sb
      .from("at_uniform_count_snapshots")
      .select("id, count_date, notes, created_at")
      .eq("company_id", companyId)
      .order("count_date", { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!snapshots || snapshots.length === 0) return NextResponse.json({ snapshots: [], consumption: null });

    // Load items for the two most recent snapshots
    const recentIds = snapshots.slice(0, 2).map(s => s.id);
    const { data: itemRows } = await sb
      .from("at_uniform_count_snapshot_items")
      .select("snapshot_id, item_name, size_label, color_label, actual_qty, avg_cost")
      .in("snapshot_id", recentIds);

    const bySnapshot: Record<string, any[]> = {};
    for (const row of itemRows ?? []) {
      (bySnapshot[row.snapshot_id] ??= []).push(row);
    }

    const latestSnap  = snapshots[0];
    const prevSnap    = snapshots[1] ?? null;
    const latestItems = bySnapshot[latestSnap.id] ?? [];
    const prevItems   = bySnapshot[prevSnap?.id ?? ""] ?? [];

    let consumption = null;

    if (prevSnap) {
      // Find receipts received between the two count dates
      const { data: receipts } = await sb
        .from("at_uniform_inventory")
        .select(`
          quantity, unit_cost,
          at_field_options!item_option_id ( label ),
          size:at_uniform_variants!size_variant_id ( label ),
          color:at_uniform_variants!color_variant_id ( label )
        `)
        .eq("company_id", companyId)
        .eq("is_void", false)
        .eq("transaction_type", "receipt")
        .gt("transaction_date", prevSnap.count_date)
        .lte("transaction_date", latestSnap.count_date);

      // Build receipt totals by key
      const receiptMap: Record<string, number> = {};
      for (const r of receipts ?? []) {
        const key = `${(r.at_field_options as any)?.label ?? ""}|${(r.size as any)?.label ?? ""}|${(r.color as any)?.label ?? ""}`;
        receiptMap[key] = (receiptMap[key] ?? 0) + Math.abs(r.quantity);
      }

      // Build consumption lines
      const allKeys = new Set([
        ...latestItems.map(i => `${i.item_name}|${i.size_label ?? ""}|${i.color_label ?? ""}`),
        ...prevItems.map(i => `${i.item_name}|${i.size_label ?? ""}|${i.color_label ?? ""}`),
      ]);

      const lines: any[] = [];
      let totalConsumedValue = 0;

      for (const key of allKeys) {
        const [item_name, size_label, color_label] = key.split("|");
        if (item_name === "Background Check") continue;

        const prev    = prevItems.find(i => `${i.item_name}|${i.size_label ?? ""}|${i.color_label ?? ""}` === key);
        const latest  = latestItems.find(i => `${i.item_name}|${i.size_label ?? ""}|${i.color_label ?? ""}` === key);
        const start_qty   = prev?.actual_qty ?? 0;
        const end_qty     = latest?.actual_qty ?? 0;
        const receipts_qty = receiptMap[key] ?? 0;
        const consumed_qty = start_qty + receipts_qty - end_qty;
        const avg_cost    = latest?.avg_cost ?? prev?.avg_cost ?? null;
        const consumed_value = avg_cost != null ? +(consumed_qty * Number(avg_cost)).toFixed(2) : null;

        if (consumed_value != null) totalConsumedValue += consumed_value;

        lines.push({
          item_name,
          size_label:      size_label || null,
          color_label:     color_label || null,
          start_qty,
          receipts_qty,
          end_qty,
          consumed_qty,
          avg_cost:        avg_cost != null ? Number(avg_cost) : null,
          consumed_value,
        });
      }

      lines.sort((a, b) =>
        a.item_name.localeCompare(b.item_name) ||
        (a.size_label ?? "").localeCompare(b.size_label ?? "") ||
        (a.color_label ?? "").localeCompare(b.color_label ?? "")
      );

      consumption = {
        from_date:            prevSnap.count_date,
        to_date:              latestSnap.count_date,
        total_consumed_value: +totalConsumedValue.toFixed(2),
        lines,
      };
    }

    return NextResponse.json({ snapshots, consumption });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — save a new monthly count, post adjustment entries, store snapshot
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const count_date = String(body.count_date ?? "").trim();
    const notes      = body.notes ? String(body.notes).trim() : null;
    const items: any[] = Array.isArray(body.items) ? body.items : [];

    if (!count_date) return NextResponse.json({ error: "count_date required" }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ error: "No items provided" }, { status: 400 });

    // 1. Create snapshot record
    const { data: snapshot, error: snapErr } = await sb
      .from("at_uniform_count_snapshots")
      .insert({ company_id: companyId, count_date, notes })
      .select("id")
      .single();

    if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });

    // 2. Insert snapshot items
    const snapItems = items.map((i: any) => ({
      snapshot_id:      snapshot.id,
      item_option_id:   i.item_option_id   || null,
      size_variant_id:  i.size_variant_id  || null,
      color_variant_id: i.color_variant_id || null,
      item_name:        i.item_name,
      size_label:       i.size_label  || null,
      color_label:      i.color_label || null,
      actual_qty:       Number(i.actual_qty),
      avg_cost:         i.avg_cost != null ? Number(i.avg_cost) : null,
    }));

    const { error: itemsErr } = await sb
      .from("at_uniform_count_snapshot_items")
      .insert(snapItems);

    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    // 3. Post adjustment ledger entries for any discrepancies
    const adjustments = items.filter((i: any) => {
      const diff = Number(i.actual_qty) - Number(i.current_on_hand ?? 0);
      return diff !== 0 && i.item_option_id;
    });

    if (adjustments.length > 0) {
      const ledgerRows = adjustments.map((i: any) => {
        const diff      = Number(i.actual_qty) - Number(i.current_on_hand ?? 0);
        const avg_cost  = i.avg_cost != null ? Number(i.avg_cost) : null;
        return {
          company_id:       companyId,
          transaction_type: "adjustment",
          item_option_id:   i.item_option_id,
          size_variant_id:  i.size_variant_id  || null,
          color_variant_id: i.color_variant_id || null,
          quantity:         diff,
          unit_cost:        avg_cost,
          total_cost:       avg_cost != null ? +(diff * avg_cost).toFixed(2) : null,
          transaction_date: count_date,
          notes:            `Monthly count reconciliation — actual: ${i.actual_qty}, was: ${i.current_on_hand ?? 0}`,
        };
      });

      const { error: adjErr } = await sb.from("at_uniform_inventory").insert(ledgerRows);
      if (adjErr) return NextResponse.json({ error: adjErr.message }, { status: 500 });
    }

    return NextResponse.json({ snapshot_id: snapshot.id, adjustments_posted: adjustments.length }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
