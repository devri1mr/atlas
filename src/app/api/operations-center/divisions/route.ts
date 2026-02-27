import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const { name, labor_rate, target_gross_profit_percent, active } = body;

    const { data, error } = await supabase
      .from("divisions")
      .insert([
        {
          name,
          labor_rate,
          target_gross_profit_percent,
          active: active ?? true,
          allow_overtime: true,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ division: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
