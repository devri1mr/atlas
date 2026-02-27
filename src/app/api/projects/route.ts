import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Short readable bid code (not the UUID)
function makeBidCode() {
  // ex: B-7K3P2Q
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "B-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,bid_code,display_name,division_id,client_id,margin_percent,internal_notes,created_by_email,created_at,is_deleted"
      )
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const division_id = body?.division_id ?? null;
    const client_id = body?.client_id ?? null;
    const margin_percent = body?.margin_percent ?? null;
    const internal_notes = body?.internal_notes ?? null;
    const created_by_email = body?.created_by_email ?? null;

    if (!division_id) {
      return NextResponse.json({ error: "division_id is required" }, { status: 400 });
    }

    // Ensure bid_code exists
    let bid_code = body?.bid_code ?? null;
    if (!bid_code) bid_code = makeBidCode();

    // REQUIRED: display_name cannot be null in your schema.
    // Use a placeholder that does NOT “name the project” (you can change it later on Accepted).
    const display_name = body?.display_name ?? `Bid ${bid_code}`;

    // Try insert; if bid_code collision happens (rare), retry once.
    const attemptInsert = async () =>
      supabase
        .from("projects")
        .insert([
          {
            bid_code,
            display_name,
            division_id,
            client_id,
            margin_percent,
            internal_notes,
            created_by_email,
            is_deleted: false,
          },
        ])
        .select("id,bid_code,display_name")
        .single();

    let { data, error } = await attemptInsert();

    if (error && String(error.message || "").toLowerCase().includes("duplicate")) {
      bid_code = makeBidCode();
      const retry = await supabase
        .from("projects")
        .insert([
          {
            bid_code,
            display_name: `Bid ${bid_code}`,
            division_id,
            client_id,
            margin_percent,
            internal_notes,
            created_by_email,
            is_deleted: false,
          },
        ])
        .select("id,bid_code,display_name")
        .single();

      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to create project" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabase.from("projects").update({ is_deleted: true }).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to delete project" }, { status: 500 });
  }
}
