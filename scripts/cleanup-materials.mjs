/**
 * One-time cleanup script:
 * 1. Creates missing categories
 * 2. Strips "SQ - " prefix from all Stone Quest materials
 * 3. Auto-assigns categories to all uncategorized Stone Quest materials
 */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://cbmnwpcasbbueiysgtkv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNibW53cGNhc2JidWVpeXNndGt2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjExNjQ2NCwiZXhwIjoyMDg3NjkyNDY0fQ.VDvqhYSWWXQeJvcs_uZBBfTP-FwA8ZaeXW9vPYif6Rc",
  { auth: { persistSession: false } }
);

// ── Existing category IDs ─────────────────────────────────────────────────────
const CAT = {
  // parents
  ROCK_STONE:   "4a7d81ed-a43b-483a-b7d3-47891e38598d",
  HARDSCAPE:    "60e4b34a-00cc-4df2-8ea7-3f24fac41380",
  SUPPLIES:     "766919fb-6cd4-4a34-babb-584d30300769",
  // existing leaves
  FLAGSTONE:    "b927e027-8303-4d5f-88eb-7464b3fd866e",
  WALL_STONE:   "5ddeb17d-ff94-4fd7-aacd-884e95961594",
  ARMOUR_STONE: "c591e649-8ca4-412f-a1dd-b27df6000f25",
  STEPS:        "f48a5c63-3054-4f75-a19e-dc8badf62ac2",
  EDGING:       "7f0c8a17-07ea-4e84-8dd3-149329112c1e",
  PAVERS:       "ef9ae692-7cbd-4f58-9aa9-e7f4846c2174",
  HARDSCAPE_SUP:"f378dfb7-00f7-4d8b-a422-25a9da447dae",
  OUTDOOR_LIVING:"e973ff11-3357-4f13-a4e7-8169e6293649",
  MULCH:        "43b0538e-b8af-41b3-bf20-9b0bcc3d25f3",
  SOIL:         "c44be382-ae65-45e1-bdb0-fa009f6279f6",
  SAND:         "16c00df6-ded5-4c2b-9d17-1d6c1093bff8",
  GRASS_SEED:   "21f9b5e7-41f2-4dad-b32f-701e03db3222",
  FERTILIZER:   "580e99e1-70cf-4559-aac9-c35c3e3c6bfb",
  WEED_BARRIER: "eedb44f3-7215-430b-bb10-f3e176907f49",
  PEAT_MIX:     "154bec99-3fba-4669-a734-f302c2b466e5",
};

// ── Step 1: Create missing categories ─────────────────────────────────────────
async function createCats() {
  function toSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  const toCreate = [
    { name: "Decorative Stone",       parent_id: CAT.ROCK_STONE,  color: "#78716c", sort_order: 1, slug: toSlug("Decorative Stone") },
    { name: "Outcropping & Boulders", parent_id: CAT.ROCK_STONE,  color: "#57534e", sort_order: 5, slug: toSlug("Outcropping & Boulders") },
    { name: "Wall Block & Coping",    parent_id: CAT.HARDSCAPE,   color: "#6366f1", sort_order: 5, slug: toSlug("Wall Block & Coping") },
    { name: "Sealers & Cleaners",     parent_id: CAT.HARDSCAPE,   color: "#0891b2", sort_order: 6, slug: toSlug("Sealers & Cleaners") },
    { name: "Drainage & Tile",        parent_id: CAT.HARDSCAPE,   color: "#0284c7", sort_order: 7, slug: toSlug("Drainage & Tile") },
    { name: "Gravel & Base",          parent_id: CAT.SUPPLIES,    color: "#92400e", sort_order: 4, slug: toSlug("Gravel & Base") },
  ];

  const ids = {};
  for (const cat of toCreate) {
    // Check if already exists
    const { data: existing } = await sb.from("material_categories")
      .select("id").eq("name", cat.name).maybeSingle();
    if (existing) {
      console.log(`  Already exists: ${cat.name} (${existing.id})`);
      ids[cat.name] = existing.id;
      continue;
    }
    const { data, error } = await sb.from("material_categories").insert(cat).select("id").single();
    if (error) { console.error(`  FAILED ${cat.name}: ${error.message}`); continue; }
    console.log(`  Created: ${cat.name} (${data.id})`);
    ids[cat.name] = data.id;
  }
  return ids;
}

// ── Step 2 & 3: Strip prefix + assign categories ──────────────────────────────
function categorize(name, newCatIds) {
  const n = name.toLowerCase();

  // ── Rock/Stone ──────────────────────────────────────────────────────────────
  if (/flagstone|pa irregular|pa tumbled flag|chilton.*flag|fon du lac.*flag|grey gorge.*flag|lannon.*tumbled|mackinaw.*flag|napoleon.*flagstone|canadian.*1\.5|fon du lac.*stepper/.test(n))
    return CAT.FLAGSTONE;
  if (/wall stone|antique wall|colonial wall|chilton.*snapped wall|fon du lac.*snapped|grey gorge.*irreg|napoleon.*irreg|mackinaw.*snapped/.test(n))
    return CAT.WALL_STONE;
  if (/outcropping|treads|winnebago|dimensional.*natural step|chilton.*dimensional|fon du lac.*dimensional/.test(n) ||
      /boulder|michigan boulders|fieldstone boulders|native boulders|dekorra/.test(n))
    return newCatIds["Outcropping & Boulders"];
  if (/barn red|beach pebble|black granite|cobblestone|fieldstone.*bulk|indian sunset|indian trail|kingston red|marble.*white blend|meremac|michigan crush|mocha marble|native gems|pea rock|pearl nuggets|river rock|rose crystals|silica pebbles|slate scape|spanish tile|superior blue|tuscan bronze|volcanic|western sunrise/.test(n))
    return newCatIds["Decorative Stone"];

  // ── Steps ───────────────────────────────────────────────────────────────────
  if (/\bstep\b|riser|tread/.test(n) && !/wall step|step riser.*kit|step.*sealer/.test(n))
    return CAT.STEPS;

  // ── Pavers ──────────────────────────────────────────────────────────────────
  if (/fendt.*paver|bay stone|harbor stone|holland 4x8|holland 8x8|eco classic|vintage 60mm|old world holland|old world vintage/.test(n))
    return CAT.PAVERS;
  if (/oaks.*paver|oaks classic|oaks premier|oaks colonnade|market 4x8|nueva 60mm|rialto 60mm|ridgefield smooth|strasa|enviro midori|molina 60mm|eterna|rialto 80|nueva 80|ridgefield plus/.test(n))
    return CAT.PAVERS;
  if (/unilock.*paver|arcana|artline|beacon hill 60mm|bristol valley|brussels paver|brussels 70mm|copthorne|courtstone|eco-priora|hex 70mm|holland premier|hollandstone|il campo|mattoni|nordic cobble|promenade|richcliff|series 4x8|skyline|soreno|thornbury|town hall|treo|turfstone|umbriano|urban 60mm|westport|brussels.*half/.test(n))
    return CAT.PAVERS;
  if (/rcp.*paver|barn plank paver|stepping stone|hf.*flagstone|hf.*paver|hf.*grand flagstone|hf.*new mission|hf.*steppers|hf.*tektramat|dimensional flagstone|grand flagstone|new mission|tektramat|pa tumbled paver|azure.*marble|glacier.*marble|champagne.*travertine|devon.*travertine|fossil.*travertine|sahara.*travertine|silverek|sterling.*travertine/.test(n))
    return CAT.PAVERS;

  // ── Wall Block & Coping ─────────────────────────────────────────────────────
  if (/fendt.*wall|fendt.*block|fendt.*corner|fendt.*cap|fendt.*coping|fendt.*verazzo|fendt.*stonegate|fendt.*glenstone|fendt.*hewnstone|fendt.*garden wall|fendt.*lenza|fendt.*standard units|compac 8|contemporary 8|contemporary corner|verazzo 6/.test(n))
    return newCatIds["Wall Block & Coping"];
  if (/fendt.*pin|wall pin/.test(n))
    return newCatIds["Wall Block & Coping"];
  if (/oaks.*wall|gardenia|laredo.*standard|laredo.*taper|laredo smooth|modan wall|nueva wall|nueva curb|oasis coping|ortana|oaks coping|oaks curb|cassina coping/.test(n))
    return newCatIds["Wall Block & Coping"];
  if (/unilock.*wall|estate wall|lineo|pisa.*wall|pisa.*corner|pisa.*coping|rivercrest.*wall|rivercrest.*corner|siena stone|siena edge|universal base block|brussels wall|ucara/.test(n))
    return newCatIds["Wall Block & Coping"];
  if (/unilock.*coping|beacon hill coping|ledgestone coping|ledgestone fullnose|ledgestone pillar|universal coping|urban coping|umbriano coping|ledgestone wide/.test(n))
    return newCatIds["Wall Block & Coping"];
  if (/rcp.*wall|cabin stone|mini cap|ez wall|barn plank wall|cc-lakeland|cc-classic|cc-universal|rcp coping|grand fire pit coping|seat wall cap|pillar cap/.test(n))
    return newCatIds["Wall Block & Coping"];
  if (/hf.*wall|hf.*outcropping|belvedere wall|grand ledge wall|heartwood wall|kodah wall|hf.*coping|hf.*column cap|hf.*camden|belvedere coping|dimensional coping|ulk.*coping|ulk.*bullnose|ulk.*pillar|black river|golden sand/.test(n))
    return newCatIds["Wall Block & Coping"];

  // ── Outdoor Living / Fire Pits ──────────────────────────────────────────────
  if (/fire pit|fireplace|firplace|hearth|wood box|grill cabinet|grill.*8 ft|contempory grill|necessories|grand.*grill|laredo.*fire pit|oaks.*fire pit|galvanized.*insert|metal insert|ucara.*modular|base cabinet|corner cabinet|end clad|backsplash|pillar unit.*ucara|superb wall panel|rail.*8 ft|alignment bar|fireplace unit|fireplace mantle|fireplace chimney|fireplace return|beaufort fire|fireplace shelf|smokeless insert|gas burner/.test(n))
    return CAT.OUTDOOR_LIVING;

  // ── Edging ──────────────────────────────────────────────────────────────────
  if (/edging|diamond-lok|diamond paver edging|edgecrete|black diamond.*edg|mighty diamond.*edg|crisp-edge|pro slide edge/.test(n) ||
      /edging stake|spiral nail|stake kit|connector.*straight|connector.*90|connector.*corner|aluminum end adapter|aluminum stake 12/.test(n))
    return CAT.EDGING;

  // ── Weed Barrier & Geotextiles ──────────────────────────────────────────────
  if (/weed barrier|geo-grid|silt fence|base fabric|drainage fabric|fabric staple|sod staple|staple setter/.test(n))
    return CAT.WEED_BARRIER;

  // ── Sealers & Cleaners ──────────────────────────────────────────────────────
  if (/sb-1300|sb-4000|sb-6000|sb-6400|sb-7700|sb-4400|sb-8700|sb-9000|sb-1000|6700 surface pro|sureclean|surestrip|solvent rx|efflo off|srb stain|oil extractor|srw m3c|paver grip|roller.*solvent|roller.*water base|squeegee/.test(n))
    return newCatIds["Sealers & Cleaners"];

  // ── Hardscape Supplies (joint sand, adhesive, accessories) ──────────────────
  if (/polysweep|wide joint|ps-1500|hydrosweep|regular jointing sand|jointing sand/.test(n))
    return CAT.HARDSCAPE_SUP;
  if (/paver bond|srw rapid set|sb-15 rapid|vertical instant lock|caulk gun/.test(n))
    return CAT.HARDSCAPE_SUP;
  if (/srw paver grip|roller.*foam/.test(n))
    return CAT.HARDSCAPE_SUP;

  // ── Drainage & Tile ─────────────────────────────────────────────────────────
  if (/tile.*corrugated|tile.*yellow fence|culvert|white.*solid pipe|white elbow|internal connector 4|downspout adapt|end cap 4|90 elbow 4|tee 4|y-wye|tile tape|pop-up|round.*basin|9"x9" basin|11"x11" basin|12"x12" basin|riser 6"|sump crock/.test(n))
    return newCatIds["Drainage & Tile"];

  // ── Mulch ───────────────────────────────────────────────────────────────────
  if (/mulch|bark|straw|pine straw|pelletized paper|profile cellulose|profile plus|earth bond tack/.test(n))
    return CAT.MULCH;

  // ── Soil & Topsoil ──────────────────────────────────────────────────────────
  if (/topsoil|garden blend|compost|dairy doo compost|seed starter|flower doo|veggie doo|tree.*shrub.*bag|topsoil blend|al-par/.test(n))
    return CAT.SOIL;

  // ── Sand ────────────────────────────────────────────────────────────────────
  if (/\bsand\b/.test(n) && !/jointing sand|joint sand|polymeric|hydrosweep|mason pool/.test(n))
    return CAT.SAND;
  if (/2ns sand|fill sand|mason pool sand|playsand/.test(n))
    return CAT.SAND;

  // ── Gravel & Base ───────────────────────────────────────────────────────────
  if (/gravel|6aa stone|limestone fines|diamond dust|#9 perm paver|23a gravel/.test(n))
    return newCatIds["Gravel & Base"];

  // ── Grass Seed ──────────────────────────────────────────────────────────────
  if (/grass seed|sunny mix|shady mix|cisco sports|contractors mix|old english mix|mdot|premium sod|tuff turf|fairway.*rye|showplace blend|straw blanket|wood pegs|green bio-stake|ez.*straw/.test(n))
    return CAT.GRASS_SEED;

  // ── Fertilizer / Chemicals ──────────────────────────────────────────────────
  if (/fertilizer|dimension|trimec|slow release|imidacloprid|starter.*50lb|dylox|dairy doo all purpose|dairy doo healthy|dairy doo safe|preen|round up|hy killz|speed zone|poison worms|woodace/.test(n))
    return CAT.FERTILIZER;

  // Armour Stone / large stone
  if (/armour stone|fieldstone boulders|michigan boulders/.test(n))
    return CAT.ARMOUR_STONE;

  return null; // unmatched — leave uncategorized
}

async function main() {
  // ── 1. Create new categories ─────────────────────────────────────────────────
  console.log("\n── Creating new categories ──────────────────────────────────");
  const newCatIds = await createCats();

  // ── 2. Fetch all Stone Quest materials ───────────────────────────────────────
  console.log("\n── Fetching Stone Quest materials ───────────────────────────");
  let allSQ = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from("materials_catalog")
      .select("id, name, category_id")
      .eq("vendor", "Stone Quest").eq("is_active", true)
      .range(from, from + 499);
    if (!data || data.length === 0) break;
    allSQ.push(...data);
    from += 500;
    if (data.length < 500) break;
  }
  console.log(`Found ${allSQ.length} Stone Quest materials`);

  // ── 3. Process each material ─────────────────────────────────────────────────
  let renamed = 0, categorized = 0, unmatched = [];

  for (const m of allSQ) {
    const newName = m.name.startsWith("SQ - ") ? m.name.slice(5) : m.name;
    const catId = m.category_id ?? categorize(newName, newCatIds);

    const patch = {};
    if (newName !== m.name) patch.name = newName;
    if (catId && catId !== m.category_id) patch.category_id = catId;

    if (Object.keys(patch).length === 0) continue;

    const { error } = await sb.from("materials_catalog").update(patch).eq("id", m.id);
    if (error) {
      console.warn(`  FAILED ${m.name}: ${error.message}`);
      continue;
    }
    if (patch.name) renamed++;
    if (patch.category_id) categorized++;
    if (!catId) unmatched.push(newName);
  }

  console.log(`\nDone!`);
  console.log(`  Renamed:     ${renamed}`);
  console.log(`  Categorized: ${categorized}`);
  console.log(`  Unmatched:   ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log("\nUnmatched (still need manual category):");
    unmatched.slice(0, 30).forEach(n => console.log(" ", n));
    if (unmatched.length > 30) console.log(`  ... and ${unmatched.length - 30} more`);
  }
}

main().catch(console.error);
