import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const task_id = req.nextUrl.searchParams.get("bundle_task_id")?.trim();
  if (!task_id) return NextResponse.json({ error: "bundle_task_id required" }, { status: 400 });
  const { data, error } = await supabase
    .from("scope_bundle_task_materials")
    .select("id, bundle_task_id, material_id, qty_per_task_unit, unit, unit_cost")
    .eq("bundle_task_id", task_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with material names from materials_catalog
  const matIds = (data ?? []).map((r: any) => r.material_id).filter(Boolean);
  let nameMap: Record<string, string> = {};
  if (matIds.length > 0) {
    const { data: cats } = await supabase
      .from("materials_catalog")
      .select("id, name")
      .in("id", matIds);
    for (const c of cats ?? []) nameMap[c.id] = c.name;
  }
  const rows = (data ?? []).map((r: any) => ({ ...r, material_name: nameMap[r.material_id] || null }));
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const bundle_task_id = String(body.bundle_task_id ?? "").trim();
  const material_id = String(body.material_id ?? "").trim();
  if (!bundle_task_id || !material_id)
    return NextResponse.json({ error: "bundle_task_id and material_id required" }, { status: 400 });
  const { data, error } = await supabase.from("scope_bundle_task_materials").insert({
    bundle_task_id,
    material_id,
    qty_per_task_unit: Number(body.qty_per_task_unit) || 1,
    unit: body.unit || "ea",
    unit_cost: body.unit_cost != null ? Number(body.unit_cost) : null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}
