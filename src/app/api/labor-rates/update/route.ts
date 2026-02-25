import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET - Fetch all labor rates with division + role names
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("division_labor_rates")
      .select(`
        id,
        division_id,
        job_role_id,
        hourly_rate,
        divisions (
          id,
          name
        ),
        job_roles (
          id,
          name
        )
      `)
      .order("division_id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST - Update hourly rate
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { id, hourly_rate } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("division_labor_rates")
      .update({ hourly_rate })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}