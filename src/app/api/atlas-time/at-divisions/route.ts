import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  const sb = supabaseAdmin();

  const [atResult, divResult] = await Promise.all([
    sb.from("at_divisions")
      .select("id, name, qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot, active, division_id")
      .order("name"),
    sb.from("divisions")
      .select("id, name, qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot, active")
      .eq("show_as_punch_item", true)
      .order("name"),
  ]);

  if (atResult.error) return NextResponse.json({ error: atResult.error.message }, { status: 500 });
  if (divResult.error) return NextResponse.json({ error: divResult.error.message }, { status: 500 });

  const atItems = (atResult.data ?? [])
    .filter(d => !activeOnly || d.active)
    .map(d => ({ ...d, source: "at" as const }));

  // Exclude divisions that are already represented by an at_division entry
  // (linked via at_divisions.division_id) to avoid duplicates in the list.
  const linkedDivIds = new Set(atItems.map(d => d.division_id).filter(Boolean));

  const divItems = (divResult.data ?? [])
    .filter(d => (!activeOnly || d.active) && !linkedDivIds.has(d.id))
    .map(d => ({ ...d, source: "div" as const }));

  const merged = [...atItems, ...divItems].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ divisions: merged });
}
