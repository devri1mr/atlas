import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = supabaseAdmin();
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { data, error } = await supabase.from("atlas_projects").select("*").eq("id", id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ project: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = supabaseAdmin();
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await req.json();
    const patch: any = {};

    if (body?.status) patch.status = String(body.status);
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("atlas_projects")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ project: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}