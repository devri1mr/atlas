import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const divisionId = body.division_id ?? null;
    const divisionName = String(body.division_name ?? "").trim() || null;
    const qbClass = String(body.qb_class ?? "").trim() || null;
    const rate = Number(body.rate);

    if (!rate || rate <= 0) return NextResponse.json({ error: "Rate must be greater than 0" }, { status: 400 });

    if (body.is_default) {
      await sb.from("at_pay_rates").update({ is_default: false }).eq("employee_id", id);
    }

    const { data, error } = await sb
      .from("at_pay_rates")
      .insert({
        employee_id: id,
        company_id: companyId,
        label: "",
        division_id: divisionId,
        division_name: divisionName,
        qb_class: qbClass,
        rate,
        effective_date: body.effective_date || new Date().toISOString().slice(0, 10),
        end_date: body.end_date || null,
        is_default: body.is_default ?? false,
      })
      .select("id, division_id, division_name, qb_class, rate, effective_date, end_date, is_default")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pay_rate: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const rateId = body.rate_id;
    if (!rateId) return NextResponse.json({ error: "rate_id required" }, { status: 400 });

    const patch: Record<string, any> = {};
    if (body.rate != null) {
      const r = Number(body.rate);
      if (!r || r <= 0) return NextResponse.json({ error: "Rate must be > 0" }, { status: 400 });
      patch.rate = r;
    }
    if (body.effective_date) patch.effective_date = body.effective_date;
    if ("division_id"   in body) patch.division_id   = body.division_id   ?? null;
    if ("division_name" in body) patch.division_name = body.division_name ?? null;
    if (body.is_default === true) {
      // Unset all other defaults for this employee first
      await sb.from("at_pay_rates").update({ is_default: false }).eq("employee_id", id);
      patch.is_default = true;
      // Also update the employee's default_pay_rate field
      if (body.rate != null) {
        await sb.from("at_employees").update({ default_pay_rate: Number(body.rate) }).eq("id", id);
      } else {
        // Fetch the rate value
        const { data: existing } = await sb.from("at_pay_rates").select("rate").eq("id", rateId).single();
        if (existing) await sb.from("at_employees").update({ default_pay_rate: existing.rate }).eq("id", id);
      }
    } else if (body.is_default === false) {
      patch.is_default = false;
    }

    const { data, error } = await sb
      .from("at_pay_rates")
      .update(patch)
      .eq("id", rateId)
      .eq("employee_id", id)
      .select("id, division_id, division_name, qb_class, rate, effective_date, end_date, is_default")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pay_rate: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const rateId = req.nextUrl.searchParams.get("rate_id");
    if (!rateId) return NextResponse.json({ error: "rate_id required" }, { status: 400 });

    const { error } = await sb
      .from("at_pay_rates")
      .delete()
      .eq("id", rateId)
      .eq("employee_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
