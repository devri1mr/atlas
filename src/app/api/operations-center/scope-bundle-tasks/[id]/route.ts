import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
  const allowed = ["task_name","item_name","unit","rule_type","rule_config","show_as_line_item_default","allow_user_edit","sort_order"];
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  const { data, error } = await supabase.from("scope_bundle_tasks").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("scope_bundle_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
