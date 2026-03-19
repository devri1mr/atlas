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

  // Fetch company_id (single-company app)
  let company_id: string | null = null;
  const { data: r1 } = await supabase.from("companies").select("id").limit(1).maybeSingle();
  if (r1?.id) { company_id = r1.id; }
  if (!company_id) {
    const { data: r2 } = await supabase.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
    company_id = r2?.company_id ?? null;
  }
  if (!company_id) return NextResponse.json({ error: "Could not determine company_id." }, { status: 500 });

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
    company_id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}
