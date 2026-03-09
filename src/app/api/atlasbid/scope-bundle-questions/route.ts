import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const bundleId = req.nextUrl.searchParams.get("bundle_id")?.trim();

    if (!bundleId) {
      return NextResponse.json(
        { error: "Missing bundle_id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("scope_bundle_questions")
      .select("*")
      .eq("bundle_id", bundleId)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rows: Array.isArray(data) ? data : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load bundle questions." },
      { status: 500 }
    );
  }
}
