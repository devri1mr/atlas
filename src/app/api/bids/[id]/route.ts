import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  try {
    const body = await req.json();

    const { data, error } = await supabase
      .from("bids")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    // ✅ always return JSON
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Update failed" },
      { status: 500 }
    );
  }
}
