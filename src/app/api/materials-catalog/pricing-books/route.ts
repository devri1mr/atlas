import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "pricing-books";
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/plain": "csv",
};

async function getCompanyId(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data } = await supabase.from("companies").select("id").limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: b } = await supabase.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  return (b?.company_id as string | null) ?? null;
}

// GET /api/materials-catalog/pricing-books
export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const companyId = await getCompanyId(supabase);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 500 });

    const { data, error } = await supabase
      .from("pricing_books")
      .select("id, name, vendor, file_path, file_type, file_size, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const withUrls = await Promise.all(
      (data ?? []).map(async (book: any) => {
        const { data: urlData } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(book.file_path, 3600);
        return { ...book, url: urlData?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ data: withUrls });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

// POST /api/materials-catalog/pricing-books — multipart/form-data: file, name?, vendor?
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const companyId = await getCompanyId(supabase);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 500 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const fileType = ALLOWED_TYPES[file.type] ?? (file.name.endsWith(".csv") ? "csv" : null);
    if (!fileType) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, Excel, or CSV." },
        { status: 400 }
      );
    }

    const name = String(formData.get("name") || file.name.replace(/\.[^.]+$/, "")).trim();
    const vendor = String(formData.get("vendor") || "").trim() || null;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? fileType;
    const storagePath = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: row, error: dbError } = await supabase
      .from("pricing_books")
      .insert({
        company_id: companyId,
        name,
        vendor,
        file_path: storagePath,
        file_type: fileType,
        file_size: file.size,
      })
      .select("id, name, vendor, file_path, file_type, file_size, created_at")
      .single();

    if (dbError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    return NextResponse.json({ data: { ...row, url: urlData?.signedUrl ?? null } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
