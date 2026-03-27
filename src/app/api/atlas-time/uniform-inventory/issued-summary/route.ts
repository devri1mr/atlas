import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

/**
 * Aggregates uniform items from all active employee profiles (uniform_items JSONB).
 * Returns totals grouped by item + size + color.
 */
export async function GET(_req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("at_employees")
      .select("id, first_name, last_name, uniform_items")
      .eq("company_id", companyId)
      .neq("status", "terminated");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aggregate uniform items across all employees
    const map = new Map<string, {
      item: string;
      size: string | null;
      color: string | null;
      qty: number;
      total_cost: number;
      employee_count: number;
    }>();

    for (const emp of data ?? []) {
      const items: any[] = Array.isArray(emp.uniform_items) ? emp.uniform_items : [];
      for (const ui of items) {
        const item  = (ui.item  ?? "").trim();
        const size  = (ui.size  ?? "").trim() || null;
        const color = (ui.color ?? "").trim() || null;
        const qty   = Number(ui.qty  ?? 1);
        const cost  = ui.cost != null ? Number(ui.cost) : null;
        if (!item) continue;

        const key = `${item}|${size ?? ""}|${color ?? ""}`;
        if (!map.has(key)) {
          map.set(key, { item, size, color, qty: 0, total_cost: 0, employee_count: 0 });
        }
        const row = map.get(key)!;
        row.qty            += qty;
        row.total_cost     += cost != null ? cost : 0;
        row.employee_count += 1;
      }
    }

    const summary = Array.from(map.values()).sort((a, b) =>
      a.item.localeCompare(b.item) ||
      (a.size ?? "").localeCompare(b.size ?? "") ||
      (a.color ?? "").localeCompare(b.color ?? "")
    );

    return NextResponse.json({ summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
