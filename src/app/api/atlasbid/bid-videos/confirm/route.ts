import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// POST /api/atlasbid/bid-videos/confirm
// Body: { bid_id, company_id, video_path, thumbnail_path, file_name, file_size, duration_seconds }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { bid_id, company_id, video_path, thumbnail_path, file_name, file_size, duration_seconds } = body;
  if (!bid_id || !company_id || !video_path || !file_name) {
    return NextResponse.json({ error: "bid_id, company_id, video_path, file_name required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bid_videos")
    .insert({
      bid_id,
      company_id,
      storage_path: video_path,
      thumbnail_path: thumbnail_path || null,
      file_name,
      file_size: file_size ? Number(file_size) : 0,
      duration_seconds: duration_seconds ? Number(duration_seconds) : null,
    })
    .select("id, bid_id, file_name, file_size, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
