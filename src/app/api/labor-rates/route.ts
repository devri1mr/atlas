import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET
export async function GET() {
  const { data: rates, error: ratesError } = await supabase
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

  const { data: divisions, error: divisionsError } = await supabase
    .from("divisions")
    .select("id, name, is_active");

  const { data: roles, error: rolesError } = await supabase
    .from("job_roles")
    .select("id, name, is_active");

  if (ratesError || divisionsError || rolesError) {
    return NextResponse.json(
      {
        error:
          ratesError?.message ||
          divisionsError?.message ||
          rolesError?.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    rates,
    divisions,
    roles,
  });
}

// POST
export async function POST(req: Request) {
  const body = await req.json();

  const { data, error } = await supabase
    .from("division_labor_rates")
    .insert([body])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PUT
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...updates } = body;

  const { data, error } = await supabase
    .from("division_labor_rates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE
export async function DELETE(req: Request) {
  const body = await req.json();

  const { error } = await supabase
    .from("division_labor_rates")
    .delete()
    .eq("id", body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
export async function PATCH(req: Request) {
  try {
    const { id, hourly_rate } = await req.json();

    if (!id || hourly_rate === undefined) {
      return NextResponse.json(
        { error: "Missing id or hourly_rate" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("division_labor_rates")
      .update({ hourly_rate })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}