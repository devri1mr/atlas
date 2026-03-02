import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getSupabase() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

// Supports either { params: {id} } or { params: Promise<{id}> }
// (you had the Promise version, which is fine if it’s working in your setup)
async function getIdFromContext(context: any): Promise<string | null> {
  const p = context?.params;
  const params = typeof p?.then === "function" ? await p : p;
  const id = params?.id;
  return typeof id === "string" ? id : null;
}

function coerceStatusId(v: any): number | null | undefined {
  // undefined = not provided (don’t change)
  // null = clear it
  // number = set it
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;

  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n)) return undefined; // caller will error
  return n;
}

const BID_SELECT =
  "id, client_name, client_last_name, status_id, internal_notes, created_at";

export async function GET(_req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);

    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: "Invalid bid id" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("bids")
      .select(BID_SELECT)
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: any) {
  try {
    const id = await getIdFromContext(context);

    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: "Invalid bid id" }, { status: 400 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const updates: Record<string, any> = {};

    if (body.client_name !== undefined) updates.client_name = body.client_name;
    if (body.client_last_name !== undefined)
      updates.client_last_name = body.client_last_name;

    if (body.internal_notes !== undefined) {
      // allow clearing notes
      updates.internal_notes =
        body.internal_notes === "" ? null : body.internal_notes;
    }

    if (body.status_id !== undefined) {
      const coerced = coerceStatusId(body.status_id);
      if (coerced === undefined) {
        return NextResponse.json(
          { error: "status_id must be an integer or null" },
          { status: 400 }
        );
      }
      updates.status_id = coerced;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("bids")
      .update(updates)
      .eq("id", id)
      .select(BID_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
