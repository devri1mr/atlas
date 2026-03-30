import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://cbmnwpcasbbueiysgtkv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNibW53cGNhc2JidWVpeXNndGt2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjExNjQ2NCwiZXhwIjoyMDg3NjkyNDY0fQ.VDvqhYSWWXQeJvcs_uZBBfTP-FwA8ZaeXW9vPYif6Rc",
  { auth: { persistSession: false } }
);

async function main() {
  // ── 1. Get company + landscaping division ────────────────────────────────
  const { data: company } = await supabase.from("companies").select("id").limit(1).single();
  if (!company) throw new Error("No company found");

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id, name")
    .ilike("name", "landscaping");
  if (!divisions?.length) throw new Error("No Landscaping division found");

  const divisionId = divisions[0].id;
  console.log(`Company: ${company.id}`);
  console.log(`Division (Landscaping): ${divisionId}`);

  // ── 2. Check if bundle already exists ────────────────────────────────────
  const { data: existing } = await supabase
    .from("scope_bundles")
    .select("id")
    .eq("name", "Stone Installation")
    .eq("division_id", divisionId)
    .maybeSingle();

  if (existing) {
    console.log("Stone Installation bundle already exists:", existing.id);
    process.exit(0);
  }

  // ── 3. Create the bundle ──────────────────────────────────────────────────
  const { data: bundle, error: bundleErr } = await supabase
    .from("scope_bundles")
    .insert({ name: "Stone Installation", division_id: divisionId, description: "River rock / stone with edging and weed fabric" })
    .select("id")
    .single();
  if (bundleErr) throw new Error("Bundle insert: " + bundleErr.message);
  console.log("Bundle created:", bundle.id);

  // ── 4. Questions ──────────────────────────────────────────────────────────
  const questions = [
    { bundle_id: bundle.id, company_id: company.id, question_key: "stone_sqft",      label: "Stone sqft",       input_type: "number",          unit: "sq ft", required: true,  default_value: null, help_text: "Total area to be covered",            sort_order: 0 },
    { bundle_id: bundle.id, company_id: company.id, question_key: "stone_depth",     label: "Stone depth",      input_type: "number",          unit: "in",    required: true,  default_value: "2",  help_text: "Depth in inches (default 2\")",        sort_order: 1 },
    { bundle_id: bundle.id, company_id: company.id, question_key: "stone_edging_lft",label: "Stone edging lft", input_type: "number",          unit: "lft",   required: true,  default_value: null, help_text: "Linear feet of edging needed",         sort_order: 2 },
    { bundle_id: bundle.id, company_id: company.id, question_key: "edging_type",     label: "Edging type",      input_type: "text", options_json: { widget: "material_select" }, unit: null, required: true,  default_value: null, help_text: "Select edging material from catalog",  sort_order: 3 },
    { bundle_id: bundle.id, company_id: company.id, question_key: "stone_type",      label: "Stone type",       input_type: "text", options_json: { widget: "material_select" }, unit: null, required: true,  default_value: null, help_text: "Select stone type from catalog",       sort_order: 4 },
  ];

  const { error: qErr } = await supabase.from("scope_bundle_questions").insert(questions);
  if (qErr) throw new Error("Questions insert: " + qErr.message);
  console.log("Questions created:", questions.length);

  // ── 5. Tasks ──────────────────────────────────────────────────────────────
  const tasksToInsert = [
    {
      bundle_id: bundle.id,
      company_id: company.id,
      task_name: "Weed Fabric Install",
      unit: "sqft",
      rule_type: "fixed_hours",
      rule_config: { stone_rule: "hours_per_stone_sqft", rate_sqft_per_hour: 400 },
      show_as_line_item_default: false,
      sort_order: 0,
      allow_user_edit: true,
    },
    {
      bundle_id: bundle.id,
      company_id: company.id,
      task_name: "Edging Install",
      unit: "lft",
      rule_type: "fixed_hours",
      rule_config: { stone_rule: "hours_per_stone_lft", minutes_per_unit: 3, choice_materials: [{ question_key: "edging_type", qty_per_unit: 1, unit: "lft" }] },
      show_as_line_item_default: false,
      sort_order: 1,
      allow_user_edit: true,
    },
    {
      bundle_id: bundle.id,
      company_id: company.id,
      task_name: "Stone Spread",
      unit: "ton",
      rule_type: "fixed_quantity",
      rule_config: { stone_rule: "stone_tons_from_sqft_depth", round_to: 0.5, minutes_per_unit: 45, choice_materials: [{ question_key: "stone_type", qty_per_unit: 1, unit: "ton" }] },
      show_as_line_item_default: false,
      sort_order: 2,
      allow_user_edit: true,
    },
  ];

  const { data: tasks, error: tErr } = await supabase
    .from("scope_bundle_tasks")
    .insert(tasksToInsert)
    .select("id, task_name");
  if (tErr) throw new Error("Tasks insert: " + tErr.message);
  console.log("Tasks created:", tasks.map(t => t.task_name).join(", "));

  const fabricTask  = tasks.find(t => t.task_name === "Weed Fabric Install");
  const edgingTask  = tasks.find(t => t.task_name === "Edging Install");
  const stoneTask   = tasks.find(t => t.task_name === "Stone Spread");

  // ── 6. Look up weed fabric in materials catalog ───────────────────────────
  const { data: fabricResults } = await supabase
    .from("materials_catalog")
    .select("id, name, default_unit, default_unit_cost")
    .ilike("name", "%weed fabric%")
    .limit(5);

  let fabricMaterialId = fabricResults?.[0]?.id ?? null;
  if (fabricMaterialId) {
    console.log("Weed fabric found:", fabricResults[0].name);
  } else {
    console.log("⚠ No weed fabric found in materials catalog — skipping fixed material link.");
  }

  // ── 7. Task materials ─────────────────────────────────────────────────────
  // Weed fabric — fixed material (if found in catalog)
  if (fabricTask && fabricMaterialId) {
    const { error: mErr } = await supabase.from("scope_bundle_task_materials").insert({
      bundle_task_id: fabricTask.id,
      material_id: fabricMaterialId,
      qty_per_task_unit: 1,
      unit: fabricResults[0].default_unit || "sqft",
      unit_cost: fabricResults[0].default_unit_cost ?? null,
    });
    if (mErr) throw new Error("Task material insert: " + mErr.message);
    console.log("Weed fabric material linked.");
  }
  // Choice materials (edging + stone) are encoded in rule_config.choice_materials
  // and resolved by the apply route at bid time — no task_material rows needed.

  console.log("\n✅ Stone Installation bundle ready!");
  console.log("   Open Bundle Builder → Landscaping → Stone Installation to review.");
  console.log("   Adjust rate_sqft_per_hour / min per unit / default depth as needed.");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
