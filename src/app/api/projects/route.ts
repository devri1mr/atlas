import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET (Bid List)
export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      bid_code,
      division_id,
      client_id,
      margin_percent,
      internal_notes,
      created_by_email,
      created_at
    `)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

// CREATE BID
export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  const body = await req.json();

  const {
    division_id,
    client_id,
    margin_percent,
    internal_notes,
  } = body;

  if (!division_id) {
    return NextResponse.json(
      { error: "Division is required." },
      { status: 400 }
    );
  }

  const created_by_email =
    req.headers.get("x-user-email") ?? "unknown";

  const { data, error } = await supabase
    .from("projects")
    .insert([
      {
        division_id,
        client_id: client_id || null,
        margin_percent,
        internal_notes,
        created_by_email,
        is_deleted: false,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

// SOFT DELETE
export async function DELETE(req: Request) {
  const supabase = supabaseAdmin();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("projects")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
