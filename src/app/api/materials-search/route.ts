import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function supabaseAdmin() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim().toLowerCase();

    let query = supabase
      .from("materials")
      .select(`
        id,
        name,
        display_name,
        common_name,
        scientific_name,
        cultivar,
        unit,
        unit_cost,
        is_active
      `)
      .eq("is_active", true)
      .limit(25);

    if (q) {
      query = query.ilike("search_text", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
