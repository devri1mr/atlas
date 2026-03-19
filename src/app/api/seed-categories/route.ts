import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Run once to seed material categories from Kluck 2026 structure.
// DELETE this file after running.

const TREE: { name: string; color?: string; children?: { name: string; children?: { name: string }[] }[] }[] = [
  {
    name: "Plants",
    color: "#22c55e",
    children: [
      {
        name: "Evergreens (BxB)",
        children: [
          { name: "Arborvitae" },
          { name: "Juniper" },
          { name: "Yew" },
          { name: "Spruce" },
          { name: "Pine" },
          { name: "Fir" },
          { name: "Hemlock" },
        ],
      },
      {
        name: "Shade Trees (BxB)",
        children: [
          { name: "Maple" },
          { name: "Oak" },
          { name: "Birch" },
          { name: "Linden" },
          { name: "Locust" },
          { name: "Hackberry" },
          { name: "Elm" },
          { name: "Ginkgo" },
          { name: "Hornbeam" },
          { name: "Other Shade Trees" },
        ],
      },
      {
        name: "Ornamental Trees",
        children: [
          { name: "Flowering Crab" },
          { name: "Cherry" },
          { name: "Redbud" },
          { name: "Dogwood" },
          { name: "Pear" },
          { name: "Serviceberry" },
        ],
      },
      {
        name: "Specialty & Accent Trees",
        children: [
          { name: "Japanese Maple" },
          { name: "Beech" },
          { name: "Magnolia" },
          { name: "Specialty Conifers" },
          { name: "Bonsai & Topiaries" },
        ],
      },
      {
        name: "Shrubs – Deciduous (Container)",
        children: [
          { name: "Hydrangea" },
          { name: "Spirea" },
          { name: "Barberry" },
          { name: "Viburnum" },
          { name: "Lilac" },
          { name: "Dogwood Shrub" },
          { name: "Physocarpus" },
          { name: "Weigela" },
          { name: "Roses" },
          { name: "Aronia" },
          { name: "Itea" },
          { name: "Other Deciduous Shrubs" },
        ],
      },
      {
        name: "Shrubs – Deciduous (BxB)",
        children: [
          { name: "Euonymus" },
          { name: "Forsythia" },
          { name: "Lilac (BxB)" },
          { name: "Viburnum (BxB)" },
        ],
      },
      {
        name: "Shrubs – Evergreen (Container)",
        children: [
          { name: "Arborvitae (Container)" },
          { name: "Juniper – Low / Spreading" },
          { name: "Yew (Container)" },
          { name: "Spruce (Container)" },
          { name: "Chamaecyparis" },
        ],
      },
      {
        name: "Broadleaf Evergreens",
        children: [
          { name: "Boxwood" },
          { name: "Holly" },
          { name: "Azalea" },
          { name: "Rhododendron" },
        ],
      },
      {
        name: "Perennials & Ground Cover",
        children: [
          { name: "Hosta" },
          { name: "Daylily" },
          { name: "Ornamental Grasses" },
          { name: "Ground Cover" },
          { name: "Assorted Perennials" },
          { name: "Premium Perennials" },
        ],
      },
    ],
  },
  {
    name: "Supplies & Soil Amendments",
    color: "#f59e0b",
    children: [
      { name: "Mulch & Bark" },
      { name: "Soil & Topsoil" },
      { name: "Peat & Planting Mix" },
      { name: "Edging" },
      { name: "Weed Barrier" },
      { name: "Tarps & Miscellaneous" },
    ],
  },
];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

export async function GET() {
  const supabase = supabaseAdmin();

  // Resolve company_id
  const { data: co } = await supabase.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  const company_id = co?.company_id ?? null;

  // Clear existing categories first
  await supabase.from("material_categories").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const created: string[] = [];

  for (let ri = 0; ri < TREE.length; ri++) {
    const root = TREE[ri];
    const { data: rootRow, error: rootErr } = await supabase
      .from("material_categories")
      .insert({ name: root.name, slug: slugify(root.name), parent_id: null, sort_order: ri, color: root.color ?? null, is_active: true, company_id })
      .select("id")
      .single();
    if (rootErr) return NextResponse.json({ error: rootErr.message, step: root.name }, { status: 500 });
    created.push(root.name);

    for (let ci = 0; ci < (root.children ?? []).length; ci++) {
      const child = root.children![ci];
      const { data: childRow, error: childErr } = await supabase
        .from("material_categories")
        .insert({ name: child.name, slug: slugify(child.name), parent_id: rootRow.id, sort_order: ci, is_active: true, company_id })
        .select("id")
        .single();
      if (childErr) return NextResponse.json({ error: childErr.message, step: child.name }, { status: 500 });
      created.push(`  ${child.name}`);

      for (let gi = 0; gi < (child.children ?? []).length; gi++) {
        const grandchild = child.children![gi];
        const { error: gcErr } = await supabase
          .from("material_categories")
          .insert({ name: grandchild.name, slug: slugify(grandchild.name), parent_id: childRow.id, sort_order: gi, is_active: true, company_id })
          .select("id")
          .single();
        if (gcErr) return NextResponse.json({ error: gcErr.message, step: grandchild.name }, { status: 500 });
        created.push(`    ${grandchild.name}`);
      }
    }
  }

  return NextResponse.json({ ok: true, created });
}
