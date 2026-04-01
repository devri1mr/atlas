import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Variant qualifier extraction ───────────────────────────────────────────────
// These patterns identify size/descriptor suffixes that make materials
// variants of the same base product (e.g. "21AA Limestone 1-2\"" → base: "21AA Limestone", label: "1-2\"")

// Inch sizes: 1", 2", 1-2", 3/4", 1-1/2", 2-4", 3/4-1/2", etc.
const INCH_SIZE_RE = /\s+\d+(?:[\/\-]\d+(?:\/\d+)?)?\s*["""''`\u2018\u2019\u201c\u201d]/g;

// Named descriptors that are variant-level (not base-product-level)
const DESCRIPTOR_RE = /\s+(?:fine|medium|coarse|crushed|washed|screened|unscreened|clean|minus|plus|bulk|bagged)\b/gi;

function extractBaseName(name: string): string {
  let base = name;
  base = base.replace(INCH_SIZE_RE, " ");
  base = base.replace(DESCRIPTOR_RE, " ");
  return base.replace(/\s+/g, " ").trim();
}

function extractVariantLabel(name: string, baseName: string): string {
  // Find what was stripped to produce the base name
  const sizeMatches: string[] = [];
  let tmp = name;
  let m: RegExpExecArray | null;

  const sizeRe = new RegExp(INCH_SIZE_RE.source, "g");
  while ((m = sizeRe.exec(name)) !== null) sizeMatches.push(m[0].trim());

  const descRe = new RegExp(DESCRIPTOR_RE.source, "gi");
  while ((m = descRe.exec(name)) !== null) sizeMatches.push(m[0].trim());

  // Remove duplicates, keep order
  const seen = new Set<string>();
  const parts = sizeMatches.filter((s) => { if (seen.has(s)) return false; seen.add(s); return true; });

  if (parts.length > 0) return parts.join(" ");

  // Fallback: words in name that aren't in baseName
  const baseWords = new Set(baseName.toLowerCase().split(/\s+/));
  const extra = name.split(/\s+/).filter((w) => !baseWords.has(w.toLowerCase()));
  return extra.join(" ").trim();
  void tmp;
}

type MaterialRow = {
  id: string;
  name: string;
  vendor: string | null;
  default_unit: string;
  default_unit_cost: number;
  category_id: string | null;
};

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = supabaseAdmin();

  // Fetch all ungrouped active materials
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

  // ── Phase 1: Group by extracted base name (within same category + unit) ─────
  // "21AA Limestone 1-2\"" and "21AA Limestone 3-4\"" → both base to "21AA Limestone"
  type RichRow = MaterialRow & { baseName: string; variantLabel: string };

  const richRows: RichRow[] = rows.map((r) => {
    const baseName = extractBaseName(r.name);
    return {
      ...r,
      baseName,
      variantLabel: extractVariantLabel(r.name, baseName),
    };
  });

  // Group key = category + unit + normalized base name
  // (don't cross category or unit boundaries)
  const groupMap = new Map<string, RichRow[]>();
  for (const r of richRows) {
    const key = `${r.category_id ?? "__none__"}::${r.default_unit}::${r.baseName.toLowerCase()}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(r);
  }

  const groups = [];
  let idx = 0;
  const groupedIds = new Set<string>();

  for (const members of groupMap.values()) {
    if (members.length < 2) continue;

    // Canonical name: the base name, using casing from the material that already
    // equals the base (if any), otherwise from the shortest original name
    const exactBase = members.find(
      (m) => m.name.toLowerCase() === m.baseName.toLowerCase()
    );
    const byLength = [...members].sort((a, b) => a.name.length - b.name.length);
    const canonicalSource = exactBase ?? byLength[0];
    const canonicalName = canonicalSource.baseName;

    // Suggested parent: prefer the one with name === canonical, else shortest
    const suggestedParent = exactBase ?? byLength[0];

    // Describe what dimensions vary
    const labels = [...new Set(members.map((m) => m.variantLabel).filter(Boolean))];
    const vendors = [...new Set(members.map((m) => m.vendor).filter(Boolean))];

    let reason = "";
    if (labels.length > 0 && vendors.length > 1) {
      reason = `${labels.length} size variant${labels.length !== 1 ? "s" : ""} across ${vendors.length} vendors`;
    } else if (labels.length > 0) {
      reason = `${labels.length} size/type variant${labels.length !== 1 ? "s" : ""} — same product, different specs`;
    } else {
      reason = `Same product, ${vendors.length} vendor${vendors.length !== 1 ? "s" : ""}: ${vendors.join(", ")}`;
    }

    groups.push({
      id: `group-${idx++}`,
      canonical_name: canonicalName,
      reason,
      suggested_parent_id: suggestedParent.id,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        cost: Number(m.default_unit_cost),
        unit: m.default_unit,
        proposed_label: m.id === suggestedParent.id && exactBase ? "" : m.variantLabel || "",
      })),
    });

    for (const m of members) groupedIds.add(m.id);
  }

  // ── Phase 2: Jaccard similarity for remaining ungrouped materials ───────────
  // Catches cross-vendor name variations that aren't size-qualifier differences
  // e.g. "Pea Gravel" (vendor A) vs "Pea Gravel Stone" (vendor B)

  const ungrouped = richRows.filter((r) => !groupedIds.has(r.id));

  const STOP_WORDS = new Set(["and", "or", "the", "a", "an", "of", "in", "for", "with", "from"]);
  function tokenize(name: string): string[] {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  }

  function similarity(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    for (const w of sa) if (sb.has(w)) inter++;
    const union = new Set([...sa, ...sb]).size;
    const jaccard = inter / union;
    if (inter >= 2) {
      const shorter = a.length <= b.length ? a : b;
      const longerSet = a.length <= b.length ? sb : sa;
      if (shorter.every((w) => longerSet.has(w))) return Math.max(jaccard, 0.88);
    }
    return jaccard;
  }

  // Union-Find
  const parent: Record<string, string> = {};
  function find(id: string): string {
    if (!parent[id]) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }
  function union(a: string, b: string) {
    parent[find(a)] = find(b);
  }

  const THRESHOLD = 0.82;
  const byCat = new Map<string, RichRow[]>();
  for (const r of ungrouped) {
    const key = `${r.category_id ?? "__none__"}::${r.default_unit}`;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(r);
  }

  for (const [, mats] of byCat) {
    const tokenized = mats.map((r) => ({ r, t: tokenize(r.name) }));
    for (let i = 0; i < tokenized.length; i++) {
      for (let j = i + 1; j < tokenized.length; j++) {
        if (similarity(tokenized[i].t, tokenized[j].t) >= THRESHOLD) {
          union(tokenized[i].r.id, tokenized[j].r.id);
        }
      }
    }
  }

  const jaccardClusters = new Map<string, RichRow[]>();
  for (const r of ungrouped) {
    const root = find(r.id);
    if (!jaccardClusters.has(root)) jaccardClusters.set(root, []);
    jaccardClusters.get(root)!.push(r);
  }

  for (const members of jaccardClusters.values()) {
    if (members.length < 2) continue;
    const byLength = [...members].sort((a, b) => a.name.length - b.name.length);
    const suggestedParent = byLength[0];
    const canonicalName = suggestedParent.baseName || suggestedParent.name;
    const vendors = [...new Set(members.map((m) => m.vendor).filter(Boolean))];
    const reason =
      vendors.length > 1
        ? `Same product, ${vendors.length} vendors: ${vendors.join(", ")}`
        : "Name variation of the same product";

    groups.push({
      id: `group-${idx++}`,
      canonical_name: canonicalName,
      reason,
      suggested_parent_id: suggestedParent.id,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        cost: Number(m.default_unit_cost),
        unit: m.default_unit,
        proposed_label: m.id === suggestedParent.id ? "" : (m.variantLabel || (() => {
          const baseWords = new Set(canonicalName.toLowerCase().split(/\s+/));
          return m.name.split(/\s+/).filter((w) => !baseWords.has(w.toLowerCase())).join(" ");
        })()),
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
