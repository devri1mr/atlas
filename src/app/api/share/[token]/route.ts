import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// GET /api/share/[token] — public endpoint, no auth required
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

  const supabase = getSupabase();

  const { data: link, error: linkErr } = await supabase
    .from("bid_share_links")
    .select("bid_id, expires_at")
    .eq("token", token)
    .single();

  if (linkErr || !link) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  // Get bid info
  const { data: bid } = await supabase
    .from("bids")
    .select("id, client_name, address, created_at")
    .eq("id", link.bid_id)
    .single();

  // Get photos
  const { data: photos } = await supabase
    .from("bid_photos")
    .select("id, storage_path, file_name, file_size, caption, tags, lat, lng, created_at")
    .eq("bid_id", link.bid_id)
    .order("created_at", { ascending: true });

  // Sign URLs (1 hour)
  const withUrls = await Promise.all(
    (photos || []).map(async (p: any) => {
      const { data: urlData } = await supabase.storage.from("bid-photos").createSignedUrl(p.storage_path, 3600);
      return { ...p, url: urlData?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ bid, photos: withUrls });
}
