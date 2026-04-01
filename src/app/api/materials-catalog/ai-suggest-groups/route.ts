import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Tokenizer ──────────────────────────────────────────────────────────────────
// Keeps sizes because they ARE product identity (2" River Rock ≠ 4" River Rock).
// Only strips bulk/wholesale/retail qualifiers that don't identify the product.

const QUALIFIER_STRIP = [
  /\s*[–\-]\s*(?:bulk|wholesale|retail|premium)\b/gi,
  /\s*\(?(?:bulk|wholesale|retail|premium)\)?\b/gi,
];

const STOP_WORDS = new Set(["and", "or", "the", "a", "an", "of", "in", "for", "with", "from"]);

function tokenize(name: string): string[] {
  let s = name.toLowerCase();
  for (const pat of QUALIFIER_STRIP) s = s.replace(pat, " ");
  s = s.replace(/[^\w\s]/g, " "); // remove punctuation, keep digits/letters
  return s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// Similarity: Jaccard with a subset bonus.
// If all tokens of the shorter name appear in the longer (min 2 shared), it's
// likely the shorter is just the "base name" of a more specific variant name.
function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);

  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = new Set([...sa, ...sb]).size;
  const jaccard = inter / union;

  // Subset check: one name's tokens all appear in the other (with ≥2 shared tokens)
  if (inter >= 2) {
    const shorter = a.length <= b.length ? a : b;
    const longerSet = a.length <= b.length ? sb : sa;
    if (shorter.every((w) => longerSet.has(w))) return Math.max(jaccard, 0.88);
  }

  return jaccard;
}

type MaterialRow = {
  id: string;
  name: string;
  vendor: string | null;
  default_unit: string;
  default_unit_cost: number;
  category_id: string | null;
};

// Mirrors apply-groups: extracts size/grade suffix beyond the canonical name
function computeVariantLabel(canonicalName: string, variantName: string): string {
  const cLower = canonicalName.toLowerCase().trim();
  const vLower = variantName.toLowerCase().trim();
  if (cLower === vLower) return "";
  if (vLower.startsWith(cLower)) {
    return variantName.slice(canonicalName.length).trim().replace(/^[\s\-–]+/, "").trim();
  }
  const canonWords = new Set(cLower.split(/\s+/));
  const variantWords = variantName.split(/\s+/);
  return variantWords.filter((w) => !canonWords.has(w.toLowerCase())).join(" ").trim();
}

// ── Union-Find ────────────────────────────────────────────────────────────────
function makeUF() {
  const parent: Record<string, string> = {};
  function find(id: string): string {
    if (!parent[id]) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }
  function union(a: string, b: string) {
    parent[find(a)] = find(b);
  }
  return { find, union };
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = supabaseAdmin();

  const { data: materials, error } = await supabase
    .from("materials_catalog")
    .select("id, name, vendor, default_unit, default_unit_cost, category_id")
    .eq("is_active", true)
    .is("parent_material_id", null)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: categories } = await supabase
    .from("material_categories")
    .select("id, name");

  const catNames = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const rows = (materials ?? []) as MaterialRow[];

  const tokenized = rows.map((r) => ({ row: r, tokens: tokenize(r.name) }));

  // Group by category to reduce comparisons and false cross-category matches
  const byCategory = new Map<string, typeof tokenized>();
  for (const t of tokenized) {
    const key = t.row.category_id ?? "__none__";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(t);
  }

  const { find, union } = makeUF();
  const THRESHOLD = 0.82; // tuned: high enough to avoid color/size false positives

  for (const [, mats] of byCategory) {
    for (let i = 0; i < mats.length; i++) {
      for (let j = i + 1; j < mats.length; j++) {
        const a = mats[i];
        const b = mats[j];

        // ── Key constraint: only group CROSS-VENDOR pairs ──────────────────
        // Same vendor → different sizes/colors are intentional variants, not duplicates.
        const av = a.row.vendor?.trim().toLowerCase();
        const bv = b.row.vendor?.trim().toLowerCase();
        if (!av || !bv || av === bv) continue;

        // Same unit required (ton ≠ cyd — different physical measure)
        if (a.row.default_unit !== b.row.default_unit) continue;

        if (similarity(a.tokens, b.tokens) >= THRESHOLD) {
          union(a.row.id, b.row.id);
        }
      }
    }
  }

  // Collect clusters of 2+
  const clusters = new Map<string, MaterialRow[]>();
  for (const { row } of tokenized) {
    const root = find(row.id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(row);
  }

  const groups = [];
  let idx = 0;

  for (const members of clusters.values()) {
    if (members.length < 2) continue;

    // Canonical name: fewest tokens (least verbose), then alphabetical
    const withTokens = members.map((m) => ({ m, t: tokenize(m.name) }));
    withTokens.sort(
      (a, b) => a.t.length - b.t.length || a.m.name.localeCompare(b.m.name)
    );
    const suggestedParent = withTokens[0].m;

    const vendors = [...new Set(members.map((m) => m.vendor).filter(Boolean))];
    const reason =
      vendors.length > 1
        ? `Same product, ${vendors.length} vendors: ${vendors.join(", ")}`
        : "Name variation of the same product";

    groups.push({
      id: `group-${idx++}`,
      canonical_name: suggestedParent.name,
      reason,
      suggested_parent_id: suggestedParent.id,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        cost: Number(m.default_unit_cost),
        unit: m.default_unit,
        proposed_label: m.id === suggestedParent.id ? "" : computeVariantLabel(suggestedParent.name, m.name),
      })),
    });
  }

  groups.sort((a, b) => b.members.length - a.members.length);

  return NextResponse.json({
    groups,
    total_materials: rows.length,
    category_map: Object.fromEntries(catNames),
  });
}
