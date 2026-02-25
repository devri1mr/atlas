import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data: rows } = await supabase
    .from("labor_rates")
    .select("*")
    .order("id");

  const { data: divisions } = await supabase
    .from("divisions")
    .select("*")
    .order("name");

  const { data: roles } = await supabase
    .from("job_roles")
    .select("*")
    .order("name");

  return NextResponse.json({
    rows: rows ?? [],
    divisions: divisions ?? [],
    roles: roles ?? [],
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  const { division_id, job_role_id, hourly_rate } = body;

  const { error } = await supabase.from("labor_rates").insert([
    {
      division_id,
      job_role_id,
      hourly_rate,
    },
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const body = await req.json();

  const { id, hourly_rate } = body;

  const { error } = await supabase
    .from("labor_rates")
    .update({ hourly_rate })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { id } = body;

  const { error } = await supabase
    .from("labor_rates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}