import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — fetch with joins so names show
export async function GET() {
  const { data, error } = await supabase
    .from("division_labor_rates")
    .select(`
      id,
      hourly_rate,
      division_id,
      job_role_id,
      divisions (
        id,
        name
      ),
      job_roles (
        id,
        name
      )
    `);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST — create new rate
export async function POST(req: Request) {
  const body = await req.json();

  const { data, error } = await supabase
    .from("division_labor_rates")
    .insert([body])
    .select(`
      id,
      hourly_rate,
      division_id,
      job_role_id,
      divisions (
        id,
        name
      ),
      job_roles (
        id,
        name
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PUT — update rate (fixes 405)
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...updates } = body;

  const { data, error } = await supabase
    .from("division_labor_rates")
    .update(updates)
    .eq("id", id)
    .select(`
      id,
      hourly_rate,
      division_id,
      job_role_id,
      divisions (
        id,
        name
      ),
      job_roles (
        id,
        name
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE
export async function DELETE(req: Request) {
  const { id } = await req.json();

  const { error } = await supabase
    .from("division_labor_rates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}