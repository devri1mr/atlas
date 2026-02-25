import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("division_labor_rates")
    .select("id, division_id, role_id, hourly_rate, divisions(name), job_roles(name)")
    .order("id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    division: r.divisions?.name ?? "",
    role: r.job_roles?.name ?? "",
    hourly_rate: r.hourly_rate ?? 0,
    division_id: r.division_id,
    role_id: r.role_id,
  }));

  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { division_id, role_id, hourly_rate } = body;

  const { error } = await supabaseAdmin
    .from("division_labor_rates")
    .insert([{ division_id, role_id, hourly_rate }]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, hourly_rate } = body;

  const { error } = await supabaseAdmin
    .from("division_labor_rates")
    .update({ hourly_rate })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { id } = body;

  const { error } = await supabaseAdmin
    .from("division_labor_rates")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}