import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "takeoff-plans";
const ALLOWED: Record<string, string> = {
  pdf: "pdf", png: "png", jpg: "jpg", jpeg: "jpg",
};

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: b } = await sb.from("bids").select("company_id").not("company_id","is",null).limit(1).maybeSingle();
  return (b?.company_id as string | null) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const filename = String(body.filename ?? "").trim();
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED[ext]) return NextResponse.json({ error: "Unsupported type. Use PDF, PNG, or JPEG." }, { status: 400 });

    const slug = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(slug);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || "Could not create upload URL" }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, path: slug, ext });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
