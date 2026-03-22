import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type BidRow = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  customer_name: string | null;
  address: string | null;
  address1: string | null;
  created_at: string;
  project_name: string | null;
};

// Extract a short street identifier from an address like "1234 Oak Street"
function streetId(address: string | null): string {
  const addr = (address || "").trim();
  // Remove leading house number, take first 2 words of street name
  return addr
    .replace(/^\d+\s*/, "")
    .split(/\s+/)
    .slice(0, 2)
    .join(" ")
    .trim();
}

// Generate the project name for a single bid given the full context of that year's bids
async function generateName(bid: BidRow, supabase: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const year = new Date(bid.created_at).getFullYear();
  const yearStart = `${year}-01-01T00:00:00`;
  const yearEnd = `${year}-12-31T23:59:59`;

  const lastName = (bid.client_last_name || "").trim();
  const firstName = (bid.client_name || "").trim();
  const companyName = (bid.customer_name || "").trim();

  let displayBase: string;
  let clientFilter: (b: BidRow) => boolean;

  if (lastName) {
    // Check if another DIFFERENT client shares this last name in the same year
    const { data: sameYearBids } = await supabase
      .from("bids")
      .select("id, client_name, client_last_name")
      .ilike("client_last_name", lastName)
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd);

    const hasConflict = (sameYearBids ?? []).some((b: any) => {
      const otherFirst = (b.client_name || "").trim().toLowerCase();
      return otherFirst !== firstName.toLowerCase();
    });

    displayBase = hasConflict && firstName ? `${firstName} ${lastName}` : lastName;
    clientFilter = (b) =>
      (b.client_last_name || "").trim().toLowerCase() === lastName.toLowerCase() &&
      (b.client_name || "").trim().toLowerCase() === firstName.toLowerCase();
  } else if (companyName) {
    displayBase = companyName;
    clientFilter = (b) =>
      (b.customer_name || "").trim().toLowerCase() === companyName.toLowerCase();
  } else {
    displayBase = "Unknown";
    clientFilter = (b) => !(b.client_last_name || "").trim() && !(b.customer_name || "").trim();
  }

  // Get all bids for this client this year, ordered by created_at, to find N
  const { data: yearBids } = await supabase
    .from("bids")
    .select("id, client_name, client_last_name, customer_name, created_at")
    .gte("created_at", yearStart)
    .lte("created_at", yearEnd)
    .order("created_at", { ascending: true });

  const clientBids = (yearBids ?? []).filter(clientFilter as any);
  const idx = clientBids.findIndex((b: any) => b.id === bid.id);
  const n = idx >= 0 ? idx + 1 : clientBids.length + 1;

  const candidate = `${displayBase} ${n} ${year}`;

  // Check if this name is already taken by a DIFFERENT bid
  const { data: taken } = await supabase
    .from("bids")
    .select("id")
    .eq("project_name", candidate)
    .neq("id", bid.id)
    .maybeSingle();

  if (!taken) return candidate;

  // Disambiguate with street address
  const street = streetId(bid.address1 || bid.address);
  if (street) {
    const withStreet = `${displayBase} - ${street} ${n} ${year}`;
    const { data: takenStreet } = await supabase
      .from("bids")
      .select("id")
      .eq("project_name", withStreet)
      .neq("id", bid.id)
      .maybeSingle();
    if (!takenStreet) return withStreet;
  }

  // Last resort: append short bid id suffix
  return `${displayBase} ${n} ${year}-${bid.id.slice(0, 4)}`;
}

/**
 * POST /api/atlasbid/project-names
 * Body: { bid_id: string }
 * Generates and saves a project name for one bid.
 */
export async function POST(req: NextRequest) {
  try {
    const { bid_id } = await req.json();
    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const supabase = supabaseAdmin();

    const { data: bid, error: bidErr } = await supabase
      .from("bids")
      .select("id, client_name, client_last_name, customer_name, address, address1, created_at, project_name")
      .eq("id", bid_id)
      .single();

    if (bidErr || !bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    const name = await generateName(bid as BidRow, supabase);

    const { data: updated, error: updateErr } = await supabase
      .from("bids")
      .update({ project_name: name })
      .eq("id", bid_id)
      .select("id, project_name")
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ project_name: updated.project_name });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/**
 * PUT /api/atlasbid/project-names
 * Batch-generates project names for ALL bids that don't have one yet.
 * Processes in created_at order so numbers are assigned consistently.
 */
export async function PUT() {
  try {
    const supabase = supabaseAdmin();

    // Fetch all bids without a project name, oldest first
    const { data: bids, error } = await supabase
      .from("bids")
      .select("id, client_name, client_last_name, customer_name, address, address1, created_at, project_name")
      .is("project_name", null)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!bids?.length) return NextResponse.json({ generated: 0, message: "No bids need project names" });

    let generated = 0;
    let failed = 0;

    for (const bid of bids) {
      try {
        const name = await generateName(bid as BidRow, supabase);
        const { error: updateErr } = await supabase
          .from("bids")
          .update({ project_name: name })
          .eq("id", bid.id);
        if (updateErr) { failed++; } else { generated++; }
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ generated, failed, total: bids.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/**
 * PATCH /api/atlasbid/project-names
 * Body: { bid_id: string, project_name: string }
 * Manually update a project name — enforces uniqueness.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { bid_id, project_name } = await req.json();
    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });
    const name = (project_name || "").trim();
    if (!name) return NextResponse.json({ error: "project_name cannot be empty" }, { status: 400 });

    const supabase = supabaseAdmin();

    // Check uniqueness
    const { data: conflict } = await supabase
      .from("bids")
      .select("id, client_name, client_last_name, customer_name, created_at")
      .eq("project_name", name)
      .neq("id", bid_id)
      .maybeSingle();

    if (conflict) {
      const year = new Date((conflict as any).created_at).getFullYear();
      const clientName = (conflict as any).customer_name ||
        [(conflict as any).client_name, (conflict as any).client_last_name].filter(Boolean).join(" ") ||
        "another bid";
      return NextResponse.json(
        { error: `"${name}" is already used by ${clientName} (${year}). Choose a different name.` },
        { status: 409 }
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from("bids")
      .update({ project_name: name })
      .eq("id", bid_id)
      .select("id, project_name")
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ project_name: updated.project_name });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
