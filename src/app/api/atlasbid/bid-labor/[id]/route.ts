import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * DELETE /api/atlasbid/bid-labor/:id
 *
 * NOTE: In some Next.js versions, route-handler ctx.params is typed as a Promise.
 * So we accept it that way to avoid TS build failures on Vercel.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();

  const { id } = await ctx.params;
  const rowId = Number(id);

  if (!Number.isFinite(rowId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { error } = await supabase.from("bid_labor").delete().eq("id", rowId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
