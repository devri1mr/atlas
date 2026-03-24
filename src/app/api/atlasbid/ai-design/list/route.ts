import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const bidId = req.nextUrl.searchParams.get("bid_id");
    if (!bidId) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const sb = supabaseAdmin();

    const { data: designs, error } = await sb
      .from("bid_ai_designs")
      .select("id, result_storage_path, refined_prompt, created_at")
      .eq("bid_id", bidId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Generate signed URLs for each design
    const withUrls = await Promise.all(
      (designs ?? []).map(async (d) => {
        const { data } = await sb.storage
          .from("bid-photos")
          .createSignedUrl(d.result_storage_path, 7200);
        return { ...d, signed_url: data?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ designs: withUrls });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
