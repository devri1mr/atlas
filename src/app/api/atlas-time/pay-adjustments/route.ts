import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET — list adjustments, optionally filtered by paycheck_date or employee_id
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const paycheckDate = searchParams.get("paycheck_date");
    const employeeId   = searchParams.get("employee_id");
    const category     = searchParams.get("category");

    let query = sb
      .from("at_pay_adjustments")
      .select(`
        id, type, category, description, amount, paycheck_date, status, notes,
        source_inventory_id, reimburses_adjustment_id, created_at,
        employee_id,
        employee:at_employees!employee_id ( id, first_name, last_name )
      `)
      .eq("company_id", companyId)
      .neq("status", "cancelled")
      .order("paycheck_date", { ascending: true })
      .order("type",          { ascending: true }) // deductions before reimbursements
      .order("created_at",    { ascending: true });

    if (paycheckDate) query = query.eq("paycheck_date", paycheckDate);
    if (employeeId)   query = query.eq("employee_id",   employeeId);
    if (category)     query = query.eq("category",      category);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ adjustments: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — create a manual or auto-generated pay adjustment
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    const employee_id    = String(body.employee_id    ?? "").trim();
    const type           = String(body.type           ?? "").trim();
    const description    = String(body.description    ?? "").trim();
    const paycheck_date  = String(body.paycheck_date  ?? "").trim();
    const amount         = Number(body.amount);

    if (!employee_id)   return NextResponse.json({ error: "employee_id required" }, { status: 400 });
    if (!type)          return NextResponse.json({ error: "type required" }, { status: 400 });
    if (!description)   return NextResponse.json({ error: "description required" }, { status: 400 });
    if (!paycheck_date) return NextResponse.json({ error: "paycheck_date required" }, { status: 400 });
    if (isNaN(amount) || amount < 0) return NextResponse.json({ error: "amount must be >= 0" }, { status: 400 });

    const { data, error } = await sb
      .from("at_pay_adjustments")
      .insert({
        company_id: companyId,
        employee_id,
        type,
        category:                 body.category                  ?? "manual",
        description,
        amount,
        paycheck_date,
        status:                   "pending",
        source_inventory_id:      body.source_inventory_id       || null,
        reimburses_adjustment_id: body.reimburses_adjustment_id  || null,
        notes:                    body.notes                     || null,
      })
      .select("id, type, category, description, amount, paycheck_date, status, notes, source_inventory_id, reimburses_adjustment_id, created_at, employee_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ adjustment: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
