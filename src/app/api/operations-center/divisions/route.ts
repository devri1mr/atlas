import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
  if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type DivisionRow = {
  id: string;
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  allow_overtime: boolean;
  active: boolean;
  show_in_ops: boolean;
  created_at?: string;
  performance_sheet_url?: string | null;
  department_id?: string | null;
  qb_class_name?: string | null;
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("divisions")
      .select("id,name,labor_rate,target_gross_profit_percent,allow_overtime,active,show_in_ops,created_at,performance_sheet_url,department_id,qb_class_name")
      .order("name", { ascending: true });

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ data: data ?? [] });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => null);

    if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });

    const name = String(body.name ?? "").trim();
    const labor_rate = Number(body.labor_rate);
    const target_gross_profit_percent = Number(body.target_gross_profit_percent);
    const allow_overtime = Boolean(body.allow_overtime ?? true);
    const active = body.active === undefined ? true : Boolean(body.active);
    const show_in_ops = Boolean(body.show_in_ops ?? false);

    if (!name) return json({ error: "name is required" }, { status: 400 });
    if (!Number.isFinite(labor_rate)) return json({ error: "labor_rate must be a number" }, { status: 400 });
    if (!Number.isFinite(target_gross_profit_percent))
      return json({ error: "target_gross_profit_percent must be a number" }, { status: 400 });

    const performance_sheet_url = body.performance_sheet_url ? String(body.performance_sheet_url).trim() : null;
    const department_id = body.department_id ? String(body.department_id) : null;
    const qb_class_name = body.qb_class_name ? String(body.qb_class_name).trim() : null;

    const insertPayload = {
      name,
      labor_rate,
      target_gross_profit_percent,
      allow_overtime,
      active,
      show_in_ops,
      performance_sheet_url,
      department_id,
      qb_class_name,
    };

    const { data, error } = await supabase
      .from("divisions")
      .insert(insertPayload)
      .select("id,name,labor_rate,target_gross_profit_percent,allow_overtime,active,show_in_ops,created_at,performance_sheet_url,department_id,qb_class_name")
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ data });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => null);

    if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });

    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "id is required" }, { status: 400 });

    // Only allow updating specific fields
    const patch: Partial<DivisionRow> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.labor_rate !== undefined) patch.labor_rate = Number(body.labor_rate);
    if (body.target_gross_profit_percent !== undefined)
      patch.target_gross_profit_percent = Number(body.target_gross_profit_percent);
    if (body.allow_overtime !== undefined) patch.allow_overtime = Boolean(body.allow_overtime);
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.show_in_ops !== undefined) patch.show_in_ops = Boolean(body.show_in_ops);
    if (body.performance_sheet_url !== undefined)
      patch.performance_sheet_url = body.performance_sheet_url ? String(body.performance_sheet_url).trim() : null;
    if (body.department_id !== undefined)
      patch.department_id = body.department_id ? String(body.department_id) : null;
    if (body.qb_class_name !== undefined)
      patch.qb_class_name = body.qb_class_name ? String(body.qb_class_name).trim() : null;

    if (patch.name !== undefined && !patch.name) return json({ error: "name cannot be blank" }, { status: 400 });
    if (patch.labor_rate !== undefined && !Number.isFinite(patch.labor_rate))
      return json({ error: "labor_rate must be a number" }, { status: 400 });
    if (
      patch.target_gross_profit_percent !== undefined &&
      !Number.isFinite(patch.target_gross_profit_percent)
    )
      return json({ error: "target_gross_profit_percent must be a number" }, { status: 400 });

    const { data, error } = await supabase
      .from("divisions")
      .update(patch)
      .eq("id", id)
      .select("id,name,labor_rate,target_gross_profit_percent,allow_overtime,active,show_in_ops,created_at,performance_sheet_url,department_id,qb_class_name")
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ data });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) return json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase.from("divisions").delete().eq("id", id);
    if (error) return json({ error: error.message }, { status: 500 });

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
