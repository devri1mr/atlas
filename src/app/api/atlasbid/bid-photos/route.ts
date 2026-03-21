import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_DIMENSION = 1920; // px — longest side
const JPEG_QUALITY  = 82;   // 0-100

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET /api/atlasbid/bid-photos?bid_id=xxx
export async function GET(req: NextRequest) {
  const bidId = req.nextUrl.searchParams.get("bid_id");
  if (!bidId) return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bid_photos")
    .select("id, bid_id, storage_path, file_name, file_size, content_type, created_at")
    .eq("bid_id", bidId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for each photo
  const withUrls = await Promise.all(
    (data || []).map(async (photo: any) => {
      const { data: urlData } = await supabase.storage
        .from("bid-photos")
        .createSignedUrl(photo.storage_path, 3600);
      return { ...photo, url: urlData?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ data: withUrls });
}

// POST /api/atlasbid/bid-photos — multipart/form-data with file(s)
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const formData = await req.formData();
    const bidId = String(formData.get("bid_id") ?? "").trim();
    if (!bidId) return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });

    // Get company_id from bid
    const { data: bid, error: bidError } = await supabase
      .from("bids")
      .select("id, company_id")
      .eq("id", bidId)
      .single();
    if (bidError || !bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    const files = formData.getAll("files") as File[];
    if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

    const inserted: any[] = [];

    for (const file of files) {
      const storagePath = `${bid.company_id}/${bidId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

      // Compress: resize to max 1920px on longest side, convert to JPEG
      const raw = Buffer.from(await file.arrayBuffer());
      const compressed = await sharp(raw)
        .rotate()                                      // auto-orient from EXIF
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();

      const { error: uploadError } = await supabase.storage
        .from("bid-photos")
        .upload(storagePath, compressed, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
      }

      const { data: row, error: insertError } = await supabase
        .from("bid_photos")
        .insert({
          bid_id: bidId,
          company_id: bid.company_id,
          storage_path: storagePath,
          file_name: file.name.replace(/\.[^.]+$/, ".jpg"),
          file_size: compressed.length,
          content_type: "image/jpeg",
        })
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      inserted.push(row);
    }

    return NextResponse.json({ data: inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}

// DELETE /api/atlasbid/bid-photos?id=xxx
export async function DELETE(req: NextRequest) {
  const photoId = req.nextUrl.searchParams.get("id");
  if (!photoId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = getSupabase();
  const { data: photo, error: fetchErr } = await supabase
    .from("bid_photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();

  if (fetchErr || !photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  await supabase.storage.from("bid-photos").remove([photo.storage_path]);

  const { error } = await supabase.from("bid_photos").delete().eq("id", photoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
