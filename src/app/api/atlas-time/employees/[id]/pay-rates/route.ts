import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? "").trim();
    const rate = Number(body.rate);

    if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
    if (!rate || rate <= 0) return NextResponse.json({ error: "Rate must be greater than 0" }, { status: 400 });

    // If this is marked default, clear other defaults first
    if (body.is_default) {
      await sb.from("at_pay_rates").update({ is_default: false }).eq("employee_id", params.id);
    }

    const { data, error } = await sb
      .from("at_pay_rates")
      .insert({
        employee_id: params.id,
        company_id: companyId,
        label,
        rate,
        effective_date: body.effective_date || new Date().toISOString().slice(0, 10),
        end_date: body.end_date || null,
        is_default: body.is_default ?? false,
      })
      .select("id, label, rate, effective_date, end_date, is_default")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pay_rate: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const rateId = req.nextUrl.searchParams.get("rate_id");
    if (!rateId) return NextResponse.json({ error: "rate_id required" }, { status: 400 });

    const { error } = await sb
      .from("at_pay_rates")
      .delete()
      .eq("id", rateId)
      .eq("employee_id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
