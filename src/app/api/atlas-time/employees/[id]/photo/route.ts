import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "employee-photos";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("photo") as File | null;
    if (!file) return NextResponse.json({ error: "No photo provided" }, { status: 400 });

    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${companyId}/${params.id}.${ext}?t=${Date.now()}`;
    const storagePath = `${companyId}/${params.id}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    // Append cache-busting query param
    const photo_url = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await sb
      .from("at_employees")
      .update({ photo_url })
      .eq("id", params.id)
      .eq("company_id", companyId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ photo_url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Try to remove both jpg and png variants
    await sb.storage.from(BUCKET).remove([
      `${companyId}/${params.id}.jpg`,
      `${companyId}/${params.id}.png`,
    ]);

    const { error } = await sb
      .from("at_employees")
      .update({ photo_url: null })
      .eq("id", params.id)
      .eq("company_id", companyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
