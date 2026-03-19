import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const bundle_id = req.nextUrl.searchParams.get("bundle_id")?.trim();
  if (!bundle_id) return NextResponse.json({ error: "bundle_id required" }, { status: 400 });
  const { data, error } = await supabase
    .from("scope_bundle_tasks")
    .select("*")
    .eq("bundle_id", bundle_id)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

async function resolveCompanyId(supabase: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  const { data: r1 } = await supabase.from("companies").select("id").limit(1).maybeSingle();
  if (r1?.id) return r1.id;
  const { data: r2 } = await supabase.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  return r2?.company_id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const bundle_id = String(body.bundle_id ?? "").trim();
  const task_name = String(body.task_name ?? "").trim();
  if (!bundle_id || !task_name)
    return NextResponse.json({ error: "bundle_id and task_name required" }, { status: 400 });

  const company_id = await resolveCompanyId(supabase);
  if (!company_id) return NextResponse.json({ error: "Could not determine company_id." }, { status: 500 });

  const { data, error } = await supabase.from("scope_bundle_tasks").insert({
    bundle_id,
    task_name,
    item_name: body.item_name || null,
    unit: body.unit || "ea",
    rule_type: body.rule_type || "fixed_quantity",
    rule_config: body.rule_config ?? {},
    show_as_line_item_default: body.show_as_line_item_default ?? true,
    allow_user_edit: body.allow_user_edit ?? true,
    sort_order: Number(body.sort_order) || 0,
    company_id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}
