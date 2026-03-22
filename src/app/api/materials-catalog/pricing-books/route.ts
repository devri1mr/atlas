import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "pricing-books";

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
      .select("id, name, vendor, file_path, file_type, file_size, logo_path, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const withUrls = await Promise.all(
      (data ?? []).map(async (book: any) => {
        const { data: urlData } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(book.file_path, 3600);
        let logo_url: string | null = null;
        if (book.logo_path) {
          const { data: logoUrlData } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(book.logo_path, 3600);
          logo_url = logoUrlData?.signedUrl ?? null;
        }
        return { ...book, url: urlData?.signedUrl ?? null, logo_url };
      })
    );

    return NextResponse.json({ data: withUrls });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

// POST /api/materials-catalog/pricing-books — JSON body: { path, name, vendor, file_type, file_size }
// Called after the client has uploaded the file directly to Supabase via presign URL
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const companyId = await getCompanyId(supabase);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 500 });

    const body = await req.json();
    const { path: filePath, name, vendor, file_type, file_size } = body;

    if (!filePath || !name || !file_type) {
      return NextResponse.json({ error: "path, name, and file_type are required" }, { status: 400 });
    }

    const { data: row, error: dbError } = await supabase
      .from("pricing_books")
      .insert({
        company_id: companyId,
        name: String(name).trim(),
        vendor: vendor ? String(vendor).trim() : null,
        file_path: filePath,
        file_type,
        file_size: file_size ?? null,
      })
      .select("id, name, vendor, file_path, file_type, file_size, created_at")
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 3600);

    return NextResponse.json({ data: { ...row, url: urlData?.signedUrl ?? null } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
