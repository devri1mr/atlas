import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);
    const project_id = Number(url.searchParams.get("project_id"));
    if (!Number.isFinite(project_id)) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });

    const { data, error } = await supabase
      .from("atlas_project_materials")
      .select("*")
      .eq("project_id", project_id)
      .order("id", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ materials: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const project_id = Number(body?.project_id);
    if (!Number.isFinite(project_id)) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });

    const quantity = Number(body?.quantity ?? 0);
    const unit_cost = Number(body?.unit_cost ?? 0);
    const total_cost = body?.total_cost !== undefined ? Number(body.total_cost) : quantity * unit_cost;

    const row = {
      project_id,
      material: String(body?.material ?? "").trim(),
      vendor: String(body?.vendor ?? ""),
      quantity,
      unit: String(body?.unit ?? ""),
      unit_cost: quantity > 0 ? total_cost / quantity : unit_cost,
      total_cost,
    };

    if (!row.material) return NextResponse.json({ error: "Material required" }, { status: 400 });

    const { data, error } = await supabase.from("atlas_project_materials").insert([row]).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("atlas_projects").update({ updated_at: new Date().toISOString() }).eq("id", project_id);

    return NextResponse.json({ row: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const id = Number(body?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const patch: any = {};
    for (const k of ["material", "vendor", "unit"]) {
      if (body[k] !== undefined) patch[k] = String(body[k]);
    }
    for (const k of ["quantity", "unit_cost", "total_cost"]) {
      if (body[k] !== undefined) patch[k] = Number(body[k]);
    }

    // normalize cost fields
    if (patch.quantity !== undefined || patch.unit_cost !== undefined || patch.total_cost !== undefined) {
      const { data: cur } = await supabase.from("atlas_project_materials").select("*").eq("id", id).single();
      const q = patch.quantity ?? cur.quantity ?? 0;
      const tc = patch.total_cost ?? (patch.unit_cost ?? cur.unit_cost ?? 0) * q;
      patch.total_cost = tc;
      patch.unit_cost = q > 0 ? tc / q : (patch.unit_cost ?? cur.unit_cost ?? 0);
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("atlas_project_materials").update(patch).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("atlas_projects").update({ updated_at: new Date().toISOString() }).eq("id", data.project_id);

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { id } = await req.json();
    const rid = Number(id);
    if (!Number.isFinite(rid)) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: existing } = await supabase.from("atlas_project_materials").select("project_id").eq("id", rid).single();

    const { error } = await supabase.from("atlas_project_materials").delete().eq("id", rid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (existing?.project_id) {
      await supabase.from("atlas_projects").update({ updated_at: new Date().toISOString() }).eq("id", existing.project_id);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}