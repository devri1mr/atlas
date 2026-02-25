import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // 1) Load active divisions + roles for dropdowns
    const [{ data: divisions, error: divErr }, { data: roles, error: roleErr }] =
      await Promise.all([
        supabase
          .from("divisions")
          .select("id,name,is_active")
          .order("name", { ascending: true }),
        supabase
          .from("job_roles")
          .select("id,name,is_active")
          .order("name", { ascending: true }),
      ]);

    if (divErr) throw divErr;
    if (roleErr) throw roleErr;

    // 2) Load all rates
    const { data: rates, error: rateErr } = await supabase
      .from("division_labor_rates")
      .select("id,division_id,job_role_id,hourly_rate,created_at")
      .order("division_id", { ascending: true })
      .order("job_role_id", { ascending: true });

    if (rateErr) throw rateErr;

    return NextResponse.json({
      divisions: divisions ?? [],
      roles: roles ?? [],
      rates: rates ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const division_id = Number(body.division_id);
    const job_role_id = Number(body.job_role_id);
    const hourly_rate = Number(body.hourly_rate);

    if (!division_id || !job_role_id || Number.isNaN(hourly_rate)) {
      return NextResponse.json(
        { error: "division_id, job_role_id, hourly_rate required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("division_labor_rates")
      .insert([{ division_id, job_role_id, hourly_rate }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ rate: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}