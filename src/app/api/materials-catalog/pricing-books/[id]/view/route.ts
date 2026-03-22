import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "pricing-books";

// GET /api/materials-catalog/pricing-books/[id]/view
// Proxies the file through Atlas's own domain — Supabase URLs never reach the client.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: book, error } = await supabase
    .from("pricing_books")
    .select("id, file_path, file_type, name")
    .eq("id", id)
    .single();

  if (error || !book) return new NextResponse("Not found", { status: 404 });

  // Download directly with the service key — no signed URL needed, nothing leaks to the client
  const { data: blob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(book.file_path);

  if (dlError || !blob) {
    return new NextResponse("File unavailable", { status: 502 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const contentType = book.file_type === "pdf" ? "application/pdf" : blob.type || "application/octet-stream";
  const safeName = book.name.replace(/[^\w\s.-]/g, "").trim() || "document";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${safeName}.${book.file_type}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
