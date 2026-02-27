import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Short readable code (no UUID shown to users)
function makeShortCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function generateUniqueBidCode(supabase: ReturnType<typeof supabaseAdmin>) {
  // retry a few times to avoid rare collisions
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `BID-${makeShortCode(8)}`;

    // If you have bid_code column, check it. If not, check project_code.
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .or(`bid_code.eq.${code},project_code.eq.${code}`)
      .limit(1);

    // If the OR fails because bid_code doesn't exist, fallback to project_code check only.
    if (error) {
      const fallback = await supabase
        .from("projects")
        .select("id")
        .eq("project_code", code)
        .limit(1);

      if (!fallback.data || fallback.data.length === 0) return code;
      continue;
    }

    if (!data || data.length === 0) return code;
  }

  // worst case fallback
  return `BID-${makeShortCode(12)}`;
}

// GET all bids/projects (lightweight list)
export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, bid_code, project_code, created_by_email, division_id, client_id, margin_percent, status_id, created_at, deleted_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

// CREATE bid/project draft
export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  const body = await req.json();

  const division_id = body?.division_id ?? null;
  const client_id = body?.client_id ?? null;
  const margin_percent =
    body?.margin_percent === "" || body?.margin_percent == null
      ? null
      : Number(body.margin_percent);

  const created_by_email = (body?.created_by_email || "").trim() || null;
  const internal_notes = (body?.internal_notes || "").trim() || null;

  if (!division_id) {
    return NextResponse.json(
      { error: "division_id is required" },
      { status: 400 }
    );
  }

  // Create a short human-friendly code and use it to satisfy NOT NULL project_code
  const code = await generateUniqueBidCode(supabase);

  // If you have a "Draft" status row, you can set it here later.
  // For now we allow status_id to be null unless your DB requires it.
  const insertRow: any = {
    project_code: code, // <-- FIXES your error
    // If your table has bid_code, store it too (harmless if column exists).
    bid_code: code,
    division_id,
    client_id,
    margin_percent: margin_percent ?? 0,
    created_by_email,
    internal_notes,
    prepay_selected: false,
    overtime_selected: false,
  };

  const { data, error } = await supabase
    .from("projects")
    .insert([insertRow])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
