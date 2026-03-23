import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const MONTHLY_LIMIT = 50;

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    // This month's count
    const { count: thisMonth } = await supabase
      .from("bid_ai_designs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);

    // All-time count
    const { count: allTime } = await supabase
      .from("bid_ai_designs")
      .select("id", { count: "exact", head: true });

    // Recent 20 generations
    const { data: recent } = await supabase
      .from("bid_ai_designs")
      .select("id, bid_id, refined_prompt, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toLocaleDateString("en-US", { month: "long", day: "numeric" });

    return NextResponse.json({
      this_month: thisMonth ?? 0,
      all_time: allTime ?? 0,
      monthly_limit: MONTHLY_LIMIT,
      next_reset: nextReset,
      recent: recent ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
