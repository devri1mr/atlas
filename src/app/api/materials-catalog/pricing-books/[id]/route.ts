import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "pricing-books";

// GET /api/materials-catalog/pricing-books/[id] — returns fresh signed URL
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: book, error } = await supabase
    .from("pricing_books")
    .select("id, file_path, file_type, name")
    .eq("id", id)
    .single();

  if (error || !book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(book.file_path, 3600);

  if (urlError || !urlData?.signedUrl) {
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
  }

  return NextResponse.json({ url: urlData.signedUrl, file_type: book.file_type, name: book.name });
}

// PATCH /api/materials-catalog/pricing-books/[id] — update logo_path or other fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();
  const body = await req.json();

  const updates: Record<string, string | null> = {};
  if ("logo_path" in body) updates.logo_path = body.logo_path ?? null;
  if ("name" in body) updates.name = String(body.name).trim();
  if ("vendor" in body) updates.vendor = body.vendor ? String(body.vendor).trim() : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pricing_books")
    .update(updates)
    .eq("id", id)
    .select("id, name, vendor, file_path, file_type, file_size, logo_path, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/materials-catalog/pricing-books/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: book, error } = await supabase
    .from("pricing_books")
    .select("id, file_path")
    .eq("id", id)
    .single();

  if (error || !book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.storage.from(BUCKET).remove([book.file_path]);

  const { error: dbError } = await supabase
    .from("pricing_books")
    .delete()
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
