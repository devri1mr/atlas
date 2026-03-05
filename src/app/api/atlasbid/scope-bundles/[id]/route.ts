import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getIdFromUrl(req: Request) {
  const pathname = new URL(req.url).pathname;
  return pathname.split("/").filter(Boolean).pop() || "";
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const id = getIdFromUrl(req);

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabase
      .from("atlas_scope_bundles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const id = getIdFromUrl(req);
    const body = await req.json();

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const patch: any = {};
    if (body?.name !== undefined) patch.name = String(body.name).trim();
    if (body?.description !== undefined) patch.description = body.description === null ? null : String(body.description);
    if (body?.division_id !== undefined) patch.division_id = body.division_id ? String(body.division_id) : null;

    if (patch.name !== undefined && !patch.name) {
      return NextResponse.json({ error: "Name cannot be blank" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("atlas_scope_bundles")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const id = getIdFromUrl(req);

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // tasks will cascade delete because table FK is on delete cascade
    const { error } = await supabase.from("atlas_scope_bundles").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
