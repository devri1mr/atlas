import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const VALID_TAGS = ["Before", "During", "After", "Issue", "Completed"];

// PATCH /api/atlasbid/bid-photos/[id] — update caption, tags, lat, lng
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if ("caption" in body) update.caption = body.caption ? String(body.caption).trim() : null;
  if ("tags" in body) {
    const tags = Array.isArray(body.tags) ? body.tags.filter((t: string) => VALID_TAGS.includes(t)) : [];
    update.tags = tags;
  }
  if ("lat" in body) update.lat = body.lat != null ? Number(body.lat) : null;
  if ("lng" in body) update.lng = body.lng != null ? Number(body.lng) : null;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bid_photos")
    .update(update)
    .eq("id", id)
    .select("id, caption, tags, lat, lng")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
