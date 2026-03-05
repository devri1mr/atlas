import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);

    const bundle_id = (url.searchParams.get("bundle_id") || "").trim();
    if (!bundle_id) return NextResponse.json({ error: "Missing bundle_id" }, { status: 400 });

    // Join to task_catalog so UI has task name/unit/minutes_per_unit
    const { data, error } = await supabase
      .from("atlas_scope_bundle_tasks")
      .select(
        `
        id,
        bundle_id,
        task_catalog_id,
        default_qty,
        created_at,
        task_catalog:task_catalog_id (
          id,
          division_id,
          name,
          unit,
          minutes_per_unit,
          default_qty,
          notes
        )
      `
      )
      .eq("bundle_id", bundle_id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const bundle_id = String(body?.bundle_id ?? "").trim();
    const task_catalog_id = String(body?.task_catalog_id ?? "").trim();
    const default_qty = body?.default_qty !== undefined ? Number(body.default_qty) : null;

    if (!bundle_id) return NextResponse.json({ error: "Missing bundle_id" }, { status: 400 });
    if (!task_catalog_id) return NextResponse.json({ error: "Missing task_catalog_id" }, { status: 400 });

    // de-dupe: same bundle + same task
    const { data: existing } = await supabase
      .from("atlas_scope_bundle_tasks")
      .select("id")
      .eq("bundle_id", bundle_id)
      .eq("task_catalog_id", task_catalog_id)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ error: "Task already in bundle" }, { status: 409 });
    }

    const row = { bundle_id, task_catalog_id, default_qty };

    const { data, error } = await supabase
      .from("atlas_scope_bundle_tasks")
      .insert([row])
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
