import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const bundle_id = String(body.bundle_id ?? "").trim();
  const question_key = String(body.question_key ?? "").trim();
  const label = String(body.label ?? "").trim();
  const input_type = String(body.input_type ?? "number").trim();
  if (!bundle_id || !question_key || !label)
    return NextResponse.json({ error: "bundle_id, question_key, and label required" }, { status: 400 });
  const { data, error } = await supabase.from("scope_bundle_questions").insert({
    bundle_id,
    question_key,
    label,
    input_type,
    unit: body.unit || null,
    required: body.required ?? false,
    default_value: body.default_value || null,
    help_text: body.help_text || null,
    sort_order: Number(body.sort_order) || 0,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}
