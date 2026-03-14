import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim().toLowerCase();

    let query = supabase
      .from("materials")
      .select(
        `
        id,
        name,
        display_name,
        unit,
        unit_cost,
        is_active
        `
      )
      .order("display_name", { ascending: true });

    if (search) {
      query = query.or(
        `display_name.ilike.%${search}%,name.ilike.%${search}%,search_text.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const name = String(body?.name || "").trim();
    const display_name = String(body?.display_name || name).trim();
    const unit = String(body?.unit || "").trim() || null;
    const unit_cost =
      body?.unit_cost === null || body?.unit_cost === undefined || body?.unit_cost === ""
        ? null
        : Number(body.unit_cost);
    const is_active =
      body?.is_active === undefined ? true : Boolean(body.is_active);

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (unit_cost !== null && !Number.isFinite(unit_cost)) {
      return NextResponse.json(
        { error: "unit_cost must be a valid number" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("materials")
      .insert({
        name,
        display_name,
        unit,
        unit_cost,
        is_active,
      })
      .select(
        `
        id,
        name,
        display_name,
        unit,
        unit_cost,
        is_active
        `
      )
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
