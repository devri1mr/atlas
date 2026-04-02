import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  const sb = supabaseAdmin();

  let query = sb
    .from("at_divisions")
    .select("id, name, qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot, active, division_id")
    .order("name");

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ divisions: data ?? [] });
}
