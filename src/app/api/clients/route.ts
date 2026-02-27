import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET clients
export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

// CREATE client
export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  const body = await req.json();

  const name = body?.name?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Client name is required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .insert([{ name }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
