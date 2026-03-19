import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);
    const project_id = Number(url.searchParams.get("project_id"));

    if (!Number.isFinite(project_id)) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    const [{ data: rows, error: rowsErr }, { data: meta, error: metaErr }] = await Promise.all([
      supabase.from("atlas_project_labor").select("*").eq("project_id", project_id).order("id", { ascending: true }),
      supabase.from("atlas_project_labor_meta").select("*").eq("project_id", project_id).single(),
    ]);

    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });

    return NextResponse.json({ labor: rows ?? [], meta });
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

    const row = {
      project_id,
      task: String(body?.task ?? "").trim(),
      item: String(body?.item ?? "").trim(),
      quantity: Number(body?.quantity ?? 0),
      unit: String(body?.unit ?? ""),
      situation: String(body?.situation ?? ""),
      job_role_id: body?.job_role_id === null || body?.job_role_id === undefined ? null : Number(body.job_role_id),
      man_hours: Number(body?.man_hours ?? 0),
    };

    if (!row.task || !row.item) return NextResponse.json({ error: "Task and Item required" }, { status: 400 });

    const { data, error } = await supabase.from("atlas_project_labor").insert([row]).select("*").single();
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

    // meta update
    if (body?.meta && body?.project_id) {
      const project_id = Number(body.project_id);
      const meta = body.meta;

      const patch = {
        trucking_hours: Number(meta.trucking_hours ?? 0),
        additional_hours: Number(meta.additional_hours ?? 0),
        ot_percent: Number(meta.ot_percent ?? 0),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("atlas_project_labor_meta")
        .upsert([{ project_id, ...patch }], { onConflict: "project_id" });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await supabase.from("atlas_projects").update({ updated_at: new Date().toISOString() }).eq("id", project_id);

      return NextResponse.json({ success: true });
    }

    // row update
    const id = Number(body?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const patch: any = {};
    for (const k of ["task", "item", "unit", "situation"]) {
      if (body[k] !== undefined) patch[k] = String(body[k]);
    }
    for (const k of ["quantity", "man_hours"]) {
      if (body[k] !== undefined) patch[k] = Number(body[k]);
    }
    if (body.job_role_id !== undefined) {
      patch.job_role_id = body.job_role_id === null || body.job_role_id === "" ? null : Number(body.job_role_id);
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("atlas_project_labor").update(patch).eq("id", id).select("*").single();
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

    const { data: existing } = await supabase.from("atlas_project_labor").select("project_id").eq("id", rid).single();

    const { error } = await supabase.from("atlas_project_labor").delete().eq("id", rid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (existing?.project_id) {
      await supabase.from("atlas_projects").update({ updated_at: new Date().toISOString() }).eq("id", existing.project_id);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}