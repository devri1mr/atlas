import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "pricing-books";
const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: "pdf", xlsx: "xlsx", xls: "xls", csv: "csv",
};

async function getCompanyId(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data } = await supabase.from("companies").select("id").limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: b } = await supabase.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  return (b?.company_id as string | null) ?? null;
}

// POST /api/materials-catalog/pricing-books/presign
// body: { filename: string }
// returns: { signedUrl: string, path: string }
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const companyId = await getCompanyId(supabase);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 500 });

    const body = await req.json();
    const filename = String(body?.filename ?? "").trim();
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS[ext]) {
      return NextResponse.json({ error: "Unsupported file type. Use PDF, Excel, or CSV." }, { status: 400 });
    }

    const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || "Could not create upload URL" }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, path, file_type: ALLOWED_EXTENSIONS[ext] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
