import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { id, hourly_rate } = await req.json();

    if (!id || hourly_rate === undefined || hourly_rate === null) {
      return NextResponse.json(
        { error: "Missing id or hourly_rate" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server env missing (SUPABASE keys)" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, serviceKey);

    const { error } = await supabase
      .from("division_labor_rates")
      .update({ hourly_rate })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}