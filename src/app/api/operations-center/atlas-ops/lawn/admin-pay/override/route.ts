import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT — upsert an override for a specific date
// body: { date, payroll_cost (null = revert to computed), notes? }
export async function PUT(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const { date, payroll_cost, notes } = body;
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    // payroll_cost === null means "revert to computed" — delete the override
    if (payroll_cost === null) {
      await sb
        .from("lawn_admin_pay_overrides")
        .delete()
        .eq("company_id", company.id)
        .eq("date", date);
      return NextResponse.json({ ok: true, deleted: true });
    }

    const { error } = await sb
      .from("lawn_admin_pay_overrides")
      .upsert(
        { company_id: company.id, date, payroll_cost: Number(payroll_cost), notes: notes ?? null },
        { onConflict: "company_id,date" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
