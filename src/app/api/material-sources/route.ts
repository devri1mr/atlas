import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function supabaseAdmin() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const materialId = searchParams.get("material_id");

    if (!materialId) {
      return NextResponse.json(
        { error: "material_id required" },
        { status: 400 }
      );
    }

    /*
    -----------------------------
    Vendor pricing
    -----------------------------
    */

    const { data: vendorRows, error: vendorError } = await supabase
      .from("material_vendor_prices")
      .select(`
        id,
        unit,
        cost,
        is_preferred,
        vendors (
          id,
          name
        )
      `)
      .eq("material_id", materialId)
      .order("cost", { ascending: true });

    if (vendorError) {
      return NextResponse.json({ error: vendorError.message }, { status: 500 });
    }

    /*
    -----------------------------
    Inventory lookup
    -----------------------------
    */

    const { data: inventoryRows } = await supabase
      .from("inventory_items")
      .select(`
        material_id,
        unit,
        avg_cost,
        qty_on_hand
      `)
      .eq("material_id", materialId)
      .gt("qty_on_hand", 0);

    /*
    -----------------------------
    Normalize sources
    -----------------------------
    */

    const sources: any[] = [];

    if (inventoryRows) {
      for (const row of inventoryRows) {
        sources.push({
          source_type: "inventory",
          source_name: "Inventory On Hand",
          unit: row.unit,
          cost: Number(row.avg_cost) || 0,
          available_qty: Number(row.qty_on_hand) || 0,
          preferred: true,
        });
      }
    }

    if (vendorRows) {
      for (const row of vendorRows) {
        sources.push({
          source_type: "vendor",
          source_name: row.vendors?.name || "Vendor",
          unit: row.unit,
          cost: Number(row.cost) || 0,
          available_qty: null,
          preferred: row.is_preferred || false,
        });
      }
    }

    return NextResponse.json({ data: sources }, { status: 200 });

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
