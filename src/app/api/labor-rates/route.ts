import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* =========================
   GET - Load Page Data
========================= */
export async function GET() {
  try {
    const { data: labor_rates, error: lrError } = await supabase
      .from("division_labor_rates")
      .select("*")
      .order("id", { ascending: true });

    if (lrError) {
      return NextResponse.json(
        { error: lrError.message },
        { status: 500 }
      );
    }

    const { data: divisions, error: divError } = await supabase
      .from("divisions")
      .select("*")
      .order("id", { ascending: true });

    if (divError) {
      return NextResponse.json(
        { error: divError.message },
        { status: 500 }
      );
    }

    const { data: roles, error: roleError } = await supabase
      .from("job_roles")
      .select("*")
      .order("id", { ascending: true });

    if (roleError) {
      return NextResponse.json(
        { error: roleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      labor_rates,
      divisions,
      roles,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load labor rates" },
      { status: 500 }
    );
  }
}

/* =========================
   POST - Create Labor Rate
========================= */
export async function POST(req: Request) {
  try {
    const { division_id, role_id, hourly_rate } = await req.json();

    if (!division_id || !role_id || hourly_rate === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("division_labor_rates")
      .insert([
        {
          division_id,
          role_id,
          hourly_rate,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create labor rate" },
      { status: 500 }
    );
  }
}

/* =========================
   PATCH - Update Rate
========================= */
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
      { error: err.message || "Failed to update rate" },
      { status: 500 }
    );
  }
}

/* =========================
   DELETE - Remove Rate
========================= */
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing id" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("division_labor_rates")
      .delete()
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
      { error: err.message || "Delete failed" },
      { status: 500 }
    );
  }
}