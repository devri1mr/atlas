import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — simple
export async function GET() {
  const { data, error } = await supabase
    .from("division_labor_rates")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST — simple
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

// PUT — simple
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

// DELETE — fixed
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