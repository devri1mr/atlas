import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type CreateProjectBody = {
  client_id: string;
  division_id: string;

  // optional fields
  display_name?: string | null;
  status_id?: string | null;

  // bid-side inputs
  margin_percent?: number | null;
  prepay_selected?: boolean;
  overtime_selected?: boolean;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown, defaultValue: boolean): boolean {
  if (v === null || v === undefined) return defaultValue;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return defaultValue;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Basic list (latest first). Adjust later as needed.
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    let body: CreateProjectBody;
    try {
      body = (await req.json()) as CreateProjectBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const client_id = body?.client_id;
    const division_id = body?.division_id;

    if (!isUuid(client_id)) {
      return NextResponse.json({ error: "client_id is required and must be a UUID" }, { status: 400 });
    }
    if (!isUuid(division_id)) {
      return NextResponse.json({ error: "division_id is required and must be a UUID" }, { status: 400 });
    }

    const status_id = body?.status_id && isUuid(body.status_id) ? body.status_id : null;

    const margin_percent = toNumberOrNull(body?.margin_percent);
    if (margin_percent !== null && (margin_percent < 0 || margin_percent > 100)) {
      return NextResponse.json({ error: "margin_percent must be between 0 and 100" }, { status: 400 });
    }

    const prepay_selected = toBool(body?.prepay_selected, false);
    const overtime_selected = toBool(body?.overtime_selected, false);

    // 1) Fetch Division (source of division defaults + division snapshot)
    const { data: division, error: divErr } = await supabase
      .from("divisions")
      .select("id, name, labor_rate, target_gross_profit_percent, allow_overtime, active")
      .eq("id", division_id)
      .single();

    if (divErr) {
      return NextResponse.json({ error: `Failed to load division: ${divErr.message}` }, { status: 500 });
    }
    if (!division) {
      return NextResponse.json({ error: "Division not found" }, { status: 404 });
    }

    // Optional guard: don't allow creating projects on inactive division
    if (division.active === false) {
      return NextResponse.json({ error: "Division is inactive" }, { status: 400 });
    }

    // 2) Fetch latest Operations Settings (global defaults + snapshot)
    // Assumes you keep one current row; this takes the most recent.
    const { data: ops, error: opsErr } = await supabase
      .from("operations_settings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (opsErr) {
      return NextResponse.json({ error: `Failed to load operations settings: ${opsErr.message}` }, { status: 500 });
    }
    if (!ops) {
      return NextResponse.json(
        { error: "No operations_settings row found. Create one first in Supabase." },
        { status: 400 }
      );
    }

    // 3) Determine project display_name
    // If not provided, default to "ClientName - DivisionName" (simple v1).
    let display_name = (body?.display_name ?? "").trim();
    if (!display_name) {
      // Try to load client name for a decent default
      const { data: client } = await supabase.from("clients").select("id, name").eq("id", client_id).maybeSingle();
      const clientName = client?.name ? String(client.name) : "Client";
      display_name = `${clientName} - ${division.name}`;
    }

    // 4) Insert project with snapshots
    // NOTE: These snapshot column names must exist in your projects table.
    // If any differ, tell me the exact columns and I’ll adjust the file.
    const insertPayload: Record<string, any> = {
      client_id,
      division_id,
      status_id,
      display_name,

      margin_percent: margin_percent ?? division.target_gross_profit_percent, // default margin to division target if not set
      prepay_selected,
      overtime_selected,

      // division snapshots
      division_labor_rate_snapshot: division.labor_rate,
      division_target_gp_snapshot: division.target_gross_profit_percent,
      division_allow_overtime_snapshot: division.allow_overtime,

      // ops snapshots (column names below must match your schema)
      contingency_percent_snapshot:
        ops.contingency_percent ?? ops.contingency ?? ops.contingency_percent_default ?? null,
      round_to_nearest_snapshot:
        ops.round_to_nearest ?? ops.round_up_to_nearest ?? ops.round_up_amount ?? null,
      prepay_discount_percent_snapshot:
        ops.prepay_discount_percent ?? ops.prepay_discount ?? ops.prepay_discount_percent_default ?? null,
    };

    const { data: created, error: insErr } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message, details: insErr.details }, { status: 500 });
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
