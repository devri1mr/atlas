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
    const bidId = (new URL(req.url).searchParams.get("bid_id") || "").trim();

    if (!bidId) {
      return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });
    }

    const { data: runs, error: runsError } = await supabase
      .from("scope_bundle_runs")
      .select("id, bundle_id")
      .eq("bid_id", bidId);

    if (runsError) {
      return NextResponse.json({ error: runsError.message }, { status: 500 });
    }

    const bundleIds = Array.from(
      new Set((runs || []).map((r: any) => r.bundle_id).filter(Boolean))
    );

    let bundleNameMap = new Map<string, string>();

    if (bundleIds.length > 0) {
      const { data: bundles, error: bundlesError } = await supabase
        .from("scope_bundles")
        .select("id, name")
        .in("id", bundleIds);

      if (bundlesError) {
        return NextResponse.json({ error: bundlesError.message }, { status: 500 });
      }

      bundleNameMap = new Map(
        (bundles || []).map((b: any) => [b.id, b.name || "Bundled Scope"])
      );
    }

    const rows = (runs || []).map((r: any) => ({
      id: r.id,
      bundle_id: r.bundle_id,
      bundle_name: bundleNameMap.get(r.bundle_id) || "Bundled Scope",
    }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load bundle runs." },
      { status: 500 }
    );
  }
}
