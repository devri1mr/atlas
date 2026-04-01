import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplyGroup = {
  parent_id: string;
  canonical_name: string;
  variants: Array<{ id: string; label: string }>;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const groups: ApplyGroup[] = body.groups ?? [];

  if (!groups.length) {
    return NextResponse.json({ groups_applied: 0, materials_linked: 0, errors: 0 });
  }

  const supabase = supabaseAdmin();
  let materialsLinked = 0;
  let errors = 0;

  for (const g of groups) {
    // Update parent's name to canonical if it differs
    const { error: parentErr } = await supabase
      .from("materials_catalog")
      .update({ name: g.canonical_name })
      .eq("id", g.parent_id);
    if (parentErr) errors++;

    // Link each variant to the parent
    for (const v of g.variants) {
      const { error: varErr } = await supabase
        .from("materials_catalog")
        .update({
          parent_material_id: g.parent_id,
          variant_label: v.label || null,
        })
        .eq("id", v.id);
      if (varErr) errors++;
      else materialsLinked++;
    }
  }

  return NextResponse.json({
    groups_applied: groups.length,
    materials_linked: materialsLinked,
    errors,
  });
}
