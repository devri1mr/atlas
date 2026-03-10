import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);

    const division_id = (url.searchParams.get("division_id") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();

    let query = supabase
      .from("scope_bundles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (division_id) query = query.eq("division_id", division_id);
    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const name = String(body?.name ?? "").trim();
    const description =
      body?.description !== undefined ? String(body.description) : null;
    const division_id = body?.division_id ? String(body.division_id) : null;
    const sort_order =
      body?.sort_order !== undefined ? Number(body.sort_order) || 0 : 0;

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const row = {
      name,
      description,
      division_id,
      sort_order,
      is_active: true,
    };

    const { data, error } = await supabase
      .from("scope_bundles")
      .insert([row])
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
