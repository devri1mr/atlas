import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Short human-friendly code you show users
function makeBidCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "B-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Project code (required by DB). Keep it short & readable, but unique enough.
// Example: P-20260227-7K3P2Q
function makeProjectCode() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const suffix = makeBidCode().replace("B-", ""); // reuse same charset
  return `P-${y}${m}${day}-${suffix}`;
}

export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,project_code,bid_code,display_name,division_id,client_id,margin_percent,internal_notes,created_by_email,created_at,is_deleted"
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

    // Always set required columns:
    // - project_code (DB requires NOT NULL)
    // - bid_code (your short code)
    // - display_name (safe placeholder)
    const bid_code = body?.bid_code ?? makeBidCode();
    const project_code = body?.project_code ?? makeProjectCode();
    const display_name = body?.display_name ?? `Bid ${bid_code}`;

    // Insert and return the new row
    const { data, error } = await supabase
      .from("projects")
      .insert([
        {
          project_code,
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
      .select("id,project_code,bid_code,display_name")
      .single();

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
