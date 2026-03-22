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
