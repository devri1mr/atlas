import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const VALID_STATUSES = ["active", "inactive", "terminated", "on_leave"];

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const { ids, action, termination_date, termination_reason } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const patch: Record<string, any> = { status: action, updated_at: new Date().toISOString() };
    if (action === "terminated") {
      patch.termination_date = termination_date ?? new Date().toISOString().split("T")[0];
      if (termination_reason) patch.termination_reason = termination_reason;
    }

    const { error } = await sb.from("at_employees").update(patch).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
