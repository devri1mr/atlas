import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const BUCKET = "bid-videos";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// GET /api/atlasbid/bid-videos?bid_id=xxx
export async function GET(req: NextRequest) {
  const bidId = req.nextUrl.searchParams.get("bid_id");
  if (!bidId) return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bid_videos")
    .select("id, bid_id, storage_path, thumbnail_path, file_name, file_size, duration_seconds, created_at")
    .eq("bid_id", bidId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUrls = await Promise.all(
    (data || []).map(async (v: any) => {
      const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(v.storage_path, 3600);
      let thumbnailUrl: string | null = null;
      if (v.thumbnail_path) {
        const { data: thumbData } = await supabase.storage.from(BUCKET).createSignedUrl(v.thumbnail_path, 3600);
        thumbnailUrl = thumbData?.signedUrl ?? null;
      }
      return { ...v, url: urlData?.signedUrl ?? null, thumbnail_url: thumbnailUrl };
    })
  );

  return NextResponse.json({ data: withUrls });
}

// DELETE /api/atlasbid/bid-videos?id=xxx
export async function DELETE(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("id");
  if (!videoId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = getSupabase();
  const { data: video, error: fetchErr } = await supabase
    .from("bid_videos")
    .select("storage_path, thumbnail_path")
    .eq("id", videoId)
    .single();

  if (fetchErr || !video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const pathsToRemove = [video.storage_path, video.thumbnail_path].filter(Boolean) as string[];
  if (pathsToRemove.length) await supabase.storage.from(BUCKET).remove(pathsToRemove);

  const { error } = await supabase.from("bid_videos").delete().eq("id", videoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
