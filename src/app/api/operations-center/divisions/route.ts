// app/api/operations-center/divisions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DivisionInsert = {
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  active?: boolean;
  allow_overtime?: boolean;
};

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY; // (fallback if you used this name earlier)

  if (!url) {
    throw new Error(
      "Missing env var NEXT_PUBLIC_SUPABASE_URL. Set it in Vercel Project Settings → Environment Variables."
    );
  }
  if (!serviceKey) {
    throw new Error(
      "Missing env var SUPABASE_SERVICE_ROLE_KEY. Set it in Vercel Project Settings → Environment Variables (Server-only)."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details },
    { status: 400 }
  );
}

function serverError(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("divisions")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return serverError("Failed to fetch divisions.", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }

    return NextResponse.json({ ok: true, divisions: data ?? [] });
  } catch (e: any) {
    return serverError("GET /divisions failed.", { message: e?.message ?? e });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    // Safely parse JSON (prevents the “Unexpected end of JSON input” crash)
    let body: any = null;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return badRequest("Invalid JSON body. Make sure you are sending JSON.");
    }

    if (!body) {
      return badRequest("Missing request body.");
    }

    const payload: DivisionInsert = {
      name: String(body.name ?? "").trim(),
      labor_rate: Number(body.labor_rate),
      target_gross_profit_percent: Number(body.target_gross_profit_percent),
      active: body.active === undefined ? true : Boolean(body.active),
      allow_overtime:
        body.allow_overtime === undefined ? true : Boolean(body.allow_overtime),
    };

    if (!payload.name) return badRequest("Division name is required.");
    if (!Number.isFinite(payload.labor_rate))
      return badRequest("Labor rate must be a valid number.");
    if (!Number.isFinite(payload.target_gross_profit_percent))
      return badRequest("Target gross profit % must be a valid number.");

    // Optional sanity checks
    if (payload.labor_rate < 0)
      return badRequest("Labor rate cannot be negative.");
    if (payload.target_gross_profit_percent < 0 || payload.target_gross_profit_percent > 100)
      return badRequest("Target gross profit % must be between 0 and 100.");

    // Insert
    const { data, error } = await supabase
      .from("divisions")
      .insert({
        name: payload.name,
        labor_rate: payload.labor_rate,
        target_gross_profit_percent: payload.target_gross_profit_percent,
        active: payload.active,
        allow_overtime: payload.allow_overtime,
      })
      .select("*")
      .single();

    if (error) {
      // Common: unique constraint on name, RLS/permission issues, etc.
      return serverError("Failed to create division.", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }

    return NextResponse.json({ ok: true, division: data });
  } catch (e: any) {
    return serverError("POST /divisions failed.", { message: e?.message ?? e });
  }
}
