import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?date=YYYY-MM-DD  — fetch dispatch jobs + manual times for a date
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const { data, error } = await sb
      .from("lawn_dispatch_jobs")
      .select(`
        id, work_order, client_name, address, city, zip, service,
        crew_code, personnel_count, start_time, end_time, time_varies,
        lawn_dispatch_job_times (
          id, employee_id, resource_name, start_time, end_time, notes
        )
      `)
      .eq("company_id", company.id)
      .eq("report_date", date)
      .order("crew_code")
      .order("start_time");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — save manual time entry for a "Varies" job
// body: { dispatch_job_id, employee_id?, resource_name, start_time, end_time?, notes? }
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { dispatch_job_id, employee_id, resource_name, start_time, end_time, notes } = body;

    if (!dispatch_job_id || !start_time) {
      return NextResponse.json({ error: "dispatch_job_id and start_time required" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("lawn_dispatch_job_times")
      .insert({ dispatch_job_id, employee_id: employee_id || null, resource_name: resource_name || null, start_time, end_time: end_time || null, notes: notes || null })
      .select("id, employee_id, resource_name, start_time, end_time, notes")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PATCH — update a manual time entry
export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const { id, start_time, end_time, notes } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("lawn_dispatch_job_times")
      .update({ start_time, end_time: end_time || null, notes: notes || null })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE ?id=  — remove a manual time entry
export async function DELETE(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb.from("lawn_dispatch_job_times").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
