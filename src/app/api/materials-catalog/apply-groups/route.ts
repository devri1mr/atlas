import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extracts the size/grade label that distinguishes a variant from its canonical parent.
// e.g. canonical="21AA Limestone", variant="21AA Limestone 1-1/2\" Minus" → "1-1/2\" Minus"
// e.g. canonical="21AA Limestone", variant="21AA Limestone" → "" (same name, vendor is the only distinction)
function computeVariantLabel(canonicalName: string, variantName: string): string {
  const cLower = canonicalName.toLowerCase().trim();
  const vLower = variantName.toLowerCase().trim();

  if (cLower === vLower) return ""; // exact same name — no size label needed

  // If variant starts with canonical, the trailing portion is the size label
  if (vLower.startsWith(cLower)) {
    return variantName
      .slice(canonicalName.length)
      .trim()
      .replace(/^[\s\-–]+/, "")
      .trim();
  }

  // Otherwise find words in variant that don't appear in canonical
  const canonWords = new Set(cLower.split(/\s+/));
  const variantWords = variantName.split(/\s+/);
  const extra = variantWords.filter((w) => !canonWords.has(w.toLowerCase()));
  return extra.join(" ").trim();
}

type ApplyGroup = {
  parent_id: string;
  canonical_name: string;
  variants: Array<{ id: string; name: string }>;
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
    // Update parent's name to canonical
    const { error: parentErr } = await supabase
      .from("materials_catalog")
      .update({ name: g.canonical_name })
      .eq("id", g.parent_id);
    if (parentErr) errors++;

    // Link each variant with a computed size/grade label
    for (const v of g.variants) {
      const label = computeVariantLabel(g.canonical_name, v.name) || null;
      const { error: varErr } = await supabase
        .from("materials_catalog")
        .update({ parent_material_id: g.parent_id, variant_label: label })
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
