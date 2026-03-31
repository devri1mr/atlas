import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Name normalization ─────────────────────────────────────────────────────────
// Returns { base, variant } where base is used for grouping and variant is the
// differentiating label (size, qualifier, etc.)

const SIZE_PATTERNS = [
  // height ranges: 4-5', 5-6ft, 3", 2.5"
  /\s+\d+(\.\d+)?[-–]\d+(\.\d+)?\s*(?:ft|'|")?/gi,
  // single sizes: 6', 6ft, 3"
  /\s+\d+(\.\d+)?\s*(?:ft|'|")\b/gi,
  // volume sizes: 2 cu ft, 3 cubic ft, 1.5 cf
  /\s+\d+(\.\d+)?\s*(?:cu\.?\s*ft|cubic\s*ft|cf)\b/gi,
  // weights: 40 lb, 50lb, 1 ton
  /\s+\d+(\.\d+)?\s*(?:lbs?|tons?)\b/gi,
  // bag counts: #5, #15 container
  /\s+#\d+\s*(?:container|pot|bag)?\b/gi,
  // gallon sizes: 1 gal, 3-gal, 5 gallon
  /\s+\d+[-–]?\s*(?:gal(?:lon)?)\b/gi,
];

const QUALIFIER_PATTERNS = [
  /\s*[–\-]\s*wholesale\b/gi,
  /\s*\(?wholesale\)?\b/gi,
  /\s*[–\-]\s*bulk\b/gi,
  /\s*\(?bulk\)?\b/gi,
  /\s*[–\-]\s*retail\b/gi,
  /\s*\(?retail\)?\b/gi,
  /\s*\(?premium\)?\b/gi,
];

function normalizeMaterial(name: string): { base: string; variant: string } {
  let working = name.trim();
  let extracted: string[] = [];

  // Extract size labels before stripping
  for (const pat of SIZE_PATTERNS) {
    const match = working.match(pat);
    if (match) extracted.push(match[0].trim());
    working = working.replace(pat, " ");
  }

  // Extract qualifiers
  let qualifier = "";
  for (const pat of QUALIFIER_PATTERNS) {
    const match = working.match(pat);
    if (match) qualifier = match[0].replace(/^[\s\-–]+/, "").trim();
    working = working.replace(pat, " ");
  }

  const base = working.replace(/\s{2,}/g, " ").trim().replace(/[–\-]+$/, "").trim();
  const variant = [...extracted.map(s => s.replace(/^[\s\-–]+/, "")), qualifier].filter(Boolean).join(", ");

  return { base: base.toLowerCase(), variant };
}

type MaterialRow = {
  id: string;
  name: string;
  vendor: string | null;
  default_unit_cost: number;
  parent_material_id: string | null;
  variant_label: string | null;
};

type ProposedGroup = {
  base: string;
  parent: MaterialRow;
  variants: Array<{ material: MaterialRow; proposed_label: string }>;
};

export async function GET(req: NextRequest) {
  const apply = req.nextUrl.searchParams.get("apply") === "true";

  try {
    const supabase = supabaseAdmin();

    const { data: rows, error } = await supabase
      .from("materials_catalog")
      .select("id, name, vendor, default_unit_cost, parent_material_id, variant_label")
      .eq("is_active", true)
      .is("parent_material_id", null) // only work with unlinked materials
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const materials = (rows ?? []) as MaterialRow[];

    // ── Build groups ────────────────────────────────────────────────────────
    const groups = new Map<string, Array<{ material: MaterialRow; variant: string }>>();

    for (const m of materials) {
      const { base, variant } = normalizeMaterial(m.name);
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push({ material: m, variant });
    }

    // Filter to groups with 2+ members
    const proposed: ProposedGroup[] = [];
    for (const [base, members] of groups.entries()) {
      if (members.length < 2) continue;

      // Pick parent: prefer the one with no extracted variant (purest name),
      // or the one with the lowest cost (usually retail / base price),
      // falling back to alphabetical first.
      const withoutVariant = members.filter(m => !m.variant);
      const parent = withoutVariant.length > 0
        ? withoutVariant[0].material
        : members.sort((a, b) => a.material.name.localeCompare(b.material.name))[0].material;

      const variants = members
        .filter(m => m.material.id !== parent.id)
        .map(m => ({
          material: m.material,
          proposed_label: m.variant || buildVendorLabel(m.material, parent),
        }));

      // Also give parent a variant label if it had one extracted
      const parentMember = members.find(m => m.material.id === parent.id)!;
      if (parentMember.variant && !parent.variant_label) {
        // parent itself has a size — label it too
        variants.unshift({
          material: parent,
          proposed_label: parentMember.variant,
        });
        // In this case, pick alphabetically first as parent
        const realParent = members.sort((a, b) => a.material.name.localeCompare(b.material.name))[0].material;
        proposed.push({
          base,
          parent: realParent,
          variants: members
            .filter(m => m.material.id !== realParent.id)
            .map(m => ({
              material: m.material,
              proposed_label: m.variant || buildVendorLabel(m.material, realParent),
            })),
        });
        continue;
      }

      proposed.push({ base, parent, variants });
    }

    if (!apply) {
      return NextResponse.json({
        dry_run: true,
        group_count: proposed.length,
        groups: proposed.map(g => ({
          base: g.base,
          parent: { id: g.parent.id, name: g.parent.name, vendor: g.parent.vendor },
          variants: g.variants.map(v => ({
            id: v.material.id,
            name: v.material.name,
            vendor: v.material.vendor,
            proposed_label: v.proposed_label,
          })),
        })),
      });
    }

    // ── Apply ───────────────────────────────────────────────────────────────
    const updates: Array<{ id: string; parent_material_id: string; variant_label: string }> = [];
    for (const g of proposed) {
      for (const v of g.variants) {
        updates.push({
          id: v.material.id,
          parent_material_id: g.parent.id,
          variant_label: v.proposed_label,
        });
      }
    }

    let applied = 0;
    for (const u of updates) {
      const { error: ue } = await supabase
        .from("materials_catalog")
        .update({ parent_material_id: u.parent_material_id, variant_label: u.variant_label })
        .eq("id", u.id);
      if (!ue) applied++;
    }

    return NextResponse.json({
      applied: true,
      groups_created: proposed.length,
      materials_linked: applied,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

function buildVendorLabel(m: MaterialRow, parent: MaterialRow): string {
  if (m.vendor && m.vendor !== parent.vendor) return m.vendor;
  if (m.name.toLowerCase().includes("wholesale")) return "wholesale";
  if (m.name.toLowerCase().includes("bulk")) return "bulk";
  return "";
}
