import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const BUCKET = "bid-videos";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// POST /api/atlasbid/bid-videos/presign
// Body: { bid_id, file_name, file_type }
// Returns signed upload URLs for both the video and its thumbnail
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { bid_id, file_name, file_type } = body;
  if (!bid_id || !file_name) return NextResponse.json({ error: "bid_id and file_name required" }, { status: 400 });

  const supabase = getSupabase();

  // Verify bid exists and get company_id
  const { data: bid, error: bidErr } = await supabase.from("bids").select("id, company_id").eq("id", bid_id).single();
  if (bidErr || !bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ext = file_name.replace(/^.*\./, "").toLowerCase() || "mp4";
  const videoPath = `${bid.company_id}/${bid_id}/${ts}.${ext}`;
  const thumbPath = `${bid.company_id}/${bid_id}/${ts}-thumb.jpg`;

  const { data: videoSign, error: videoErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(videoPath);
  if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 });

  const { data: thumbSign, error: thumbErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(thumbPath);
  if (thumbErr) return NextResponse.json({ error: thumbErr.message }, { status: 500 });

  return NextResponse.json({
    videoSignedUrl: videoSign.signedUrl,
    videoPath,
    thumbnailSignedUrl: thumbSign.signedUrl,
    thumbnailPath: thumbPath,
    company_id: bid.company_id,
  });
}
