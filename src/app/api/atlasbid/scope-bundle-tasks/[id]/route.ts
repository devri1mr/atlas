import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getIdFromUrl(req: Request) {
  const pathname = new URL(req.url).pathname;
  return pathname.split("/").filter(Boolean).pop() || "";
}

export async function DELETE(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const id = getIdFromUrl(req);

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabase.from("atlas_scope_bundle_tasks").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
