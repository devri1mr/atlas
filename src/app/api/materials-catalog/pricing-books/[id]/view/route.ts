import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "pricing-books";

// GET /api/materials-catalog/pricing-books/[id]/view
// Proxies the PDF through Atlas's own domain so the Supabase URL is never exposed.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: book, error } = await supabase
    .from("pricing_books")
    .select("id, file_path, file_type, name")
    .eq("id", id)
    .single();

  if (error || !book) return new NextResponse("Not found", { status: 404 });

  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(book.file_path, 3600);

  if (urlError || !urlData?.signedUrl) {
    return new NextResponse("Could not generate download URL", { status: 500 });
  }

  const upstream = await fetch(urlData.signedUrl);
  if (!upstream.ok) return new NextResponse("File not found", { status: 404 });

  const contentType = book.file_type === "pdf" ? "application/pdf" : upstream.headers.get("content-type") ?? "application/octet-stream";
  const safeName = encodeURIComponent(book.name.replace(/[^\w\s.-]/g, ""));

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeName}.${book.file_type}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
