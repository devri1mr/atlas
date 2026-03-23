import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// SQL to create the required table (run once in Supabase):
//
// create table if not exists bid_acceptances (
//   id uuid primary key default gen_random_uuid(),
//   bid_id uuid not null references bids(id) on delete cascade,
//   signature_type text not null check (signature_type in ('draw', 'type')),
//   signature_data text,       -- base64 PNG (draw) or typed name (type)
//   signer_name text,
//   accepted_at timestamptz not null default now(),
//   ip_address text,
//   user_agent text
// );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bid_id, signature_type, signature_data, signer_name } = body;

    if (!bid_id || !signature_type || !signature_data) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Verify bid exists
    const { data: bid } = await supabase
      .from("bids")
      .select("id")
      .eq("id", bid_id)
      .single();

    if (!bid) {
      return NextResponse.json({ error: "Bid not found" }, { status: 404 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const { error: insertError } = await supabase
      .from("bid_acceptances")
      .insert({
        bid_id,
        signature_type,
        signature_data,
        signer_name: signer_name ?? null,
        ip_address: ip,
        user_agent: userAgent,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update bid status to "accepted" — look up the status id first
    const { data: acceptedStatus } = await supabase
      .from("statuses")
      .select("id")
      .ilike("name", "accepted")
      .limit(1)
      .maybeSingle();
    if (acceptedStatus) {
      await supabase.from("bids").update({ status_id: acceptedStatus.id }).eq("id", bid_id);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
