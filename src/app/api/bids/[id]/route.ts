import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * GET /api/bids/:id
 * NOTE: Some Next.js/Vercel builds type ctx.params as a Promise.
 * Use Promise<{id:string}> to avoid TS build failures.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();

  const { id } = await ctx.params;

  const { data, error } = await supabase
    .from("bids")
    .select(
      `
      id,
      client_name,
      client_last_name,
      created_at,
      status_id,
      internal_notes,
      division_id,
      statuses (
        id,
        name,
        color
      )
      `
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/bids/:id
 * Soft delete if you have is_deleted; otherwise hard delete.
 * Keep this minimal and safe.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await ctx.params;

  // If you have soft-delete column, prefer it:
  // const { error } = await supabase.from("bids").update({ is_deleted: true }).eq("id", id);

  const { error } = await supabase.from("bids").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
