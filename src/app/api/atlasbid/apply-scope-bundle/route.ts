import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

type BundleQuestion = {
  id: string;
  bundle_id: string;
  question_key: string;
  label: string;
  input_type: string;
  unit?: string | null;
  required?: boolean | null;
  default_value?: string | null;
  help_text?: string | null;
  options_json?: any;
  sort_order?: number | null;
};

type BundleTask = {
  id: string;
  bundle_id: string;
  task_name: string;
  item_name?: string | null;
  unit?: string | null;
  rule_type: string;
  rule_config?: any;
  show_as_line_item_default?: boolean | null;
  allow_user_edit?: boolean | null;
  sort_order?: number | null;
};

type BidRow = {
  id: string;
  division_id?: string | null;
  company_id: string | null;
};

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolFromAnswer(v: unknown) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y" || s === "on";
}

function roundToIncrement(value: number, increment: number) {
  const v = num(value, 0);
  const inc = num(increment, 0);
  if (inc <= 0) return v;
  return Math.round(v / inc) * inc;
}

function getAnswer(
  answers: Record<string, any>,
  questionsByKey: Map<string, BundleQuestion>,
  key: string
) {
  if (answers[key] !== undefined && answers[key] !== null && answers[key] !== "") {
    return answers[key];
  }

  const q = questionsByKey.get(key);
  return q?.default_value ?? null;
}

function computeTask(
  task: BundleTask,
  answers: Record<string, any>,
  questionsByKey: Map<string, BundleQuestion>
) {
  const config = task.rule_config ?? {};
  const ruleType = String(task.rule_type || "");
  const unit = String(task.unit || "ea");

  const questionKey =
    config?.question ||
    config?.question_key ||
    config?.depends_on ||
    "";

  // GLOBAL CHECKBOX GATE
  if (questionKey) {
    const isChecked = boolFromAnswer(
      getAnswer(answers, questionsByKey, questionKey)
    );

    if (!isChecked) {
      return {
        skip: true,
        taskName: task.task_name,
        itemName: task.item_name || "",
        unit,
        quantity: 0,
        manHours: 0,
        showAsLineItem: Boolean(task.show_as_line_item_default ?? true),
        generatedByRule: ruleType,
        generatedFromQuestionKeys: [questionKey],
      };
    }
  }

  // ---- EVERYTHING BELOW MUST BE OUTSIDE THE IF ----

  const mulchSqft = num(getAnswer(answers, questionsByKey, "mulch_sqft"), 0);
  const depthFromAnswer = num(getAnswer(answers, questionsByKey, "mulch_depth"), 0);

  let quantity = 0;
  let manHours = 0;
  let skip = false;
  let generatedFromQuestionKeys: string[] = [];

  if (ruleType === "mulch_yards_from_sqft_depth") {
    const depthInches = num(config?.depth_inches, depthFromAnswer || 3);
    const roundTo = num(config?.round_to, 1);

    quantity = mulchSqft > 0 ? (mulchSqft * depthInches) / 324 : 0;
    quantity = roundToIncrement(quantity, roundTo);
    generatedFromQuestionKeys = ["mulch_sqft", "mulch_depth"];

  } else if (ruleType === "hours_per_sqft") {
    const rateSqftPerHour = num(config?.rate_sqft_per_hour, 0);
    manHours = rateSqftPerHour > 0 ? mulchSqft / rateSqftPerHour : 0;
    generatedFromQuestionKeys = ["mulch_sqft"];

  } else if (ruleType === "hours_per_qty") {
    const qty = num(config?.quantity, 0);
    const rateQtyPerHour = num(config?.rate_qty_per_hour, 0);
    quantity = qty;
    manHours = rateQtyPerHour > 0 ? qty / rateQtyPerHour : 0;

  } else if (ruleType === "linear_feet_from_sqft") {
    const factor = num(config?.factor, 0);
    quantity = mulchSqft * factor;
    quantity = roundToIncrement(quantity, num(config?.round_to, 1));
    generatedFromQuestionKeys = ["mulch_sqft"];

  } else if (ruleType === "fixed_quantity") {
    quantity = num(config?.quantity, 0);

  } else if (ruleType === "fixed_hours") {
    manHours = num(config?.hours, 0);

  } else if (ruleType === "conditional_if_checked") {
    const conditionalKey = String(config?.question || "");
    const isChecked = boolFromAnswer(
      getAnswer(answers, questionsByKey, conditionalKey)
    );

    if (!isChecked) {
      skip = true;
    } else {
      if (unit === "sqft") {
        quantity = mulchSqft;
      } else if (unit === "yd") {
        const depthInches = num(config?.depth_inches, depthFromAnswer || 3);
        quantity = mulchSqft > 0 ? (mulchSqft * depthInches) / 324 : 0;
        quantity = roundToIncrement(quantity, num(config?.round_to, 1));
      } else if (unit === "lf") {
        quantity = mulchSqft * num(config?.factor, 0);
        quantity = roundToIncrement(quantity, num(config?.round_to, 1));
      }

      const rateSqftPerHour = num(config?.rate_sqft_per_hour, 0);
      if (rateSqftPerHour > 0 && mulchSqft > 0) {
        manHours = mulchSqft / rateSqftPerHour;
      }

      generatedFromQuestionKeys = conditionalKey ? [conditionalKey] : [];
    }

  } else {
    skip = true;
  }

  quantity = Number(quantity.toFixed(2));
  manHours = Number(manHours.toFixed(2));

  if (quantity <= 0 && manHours <= 0) {
    skip = true;
  }

  return {
    skip,
    taskName: task.task_name,
    itemName: task.item_name || "",
    unit,
    quantity,
    manHours,
    showAsLineItem: Boolean(task.show_as_line_item_default ?? true),
    generatedByRule: ruleType,
    generatedFromQuestionKeys,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json().catch(() => ({}));

    const bidId = String(body?.bid_id ?? "").trim();
    const bundleId = String(body?.bundle_id ?? "").trim();
    const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};

    if (!bidId) {
      return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });
    }

    if (!bundleId) {
      return NextResponse.json({ error: "Missing bundle_id" }, { status: 400 });
    }

    const { data: bidRow, error: bidError } = await supabase
      .from("bids")
      .select("id, division_id, company_id")
      .eq("id", bidId)
      .single<BidRow>();

    if (bidError || !bidRow?.id) {
      return NextResponse.json(
        { error: bidError?.message || "Bid not found." },
        { status: 404 }
      );
    }

    if (!bidRow.company_id) {
      return NextResponse.json(
        { error: "Bid missing company_id." },
        { status: 400 }
      );
    }

    if (!bidRow.division_id) {
      return NextResponse.json(
        { error: "Bid has no division_id." },
        { status: 400 }
      );
    }

    const hourlyRate = num(body?.hourly_rate, 0);

    if (hourlyRate <= 0) {
      return NextResponse.json(
        { error: "Hourly rate is 0 or missing." },
        { status: 400 }
      );
    }

    // Fetch existing bundle labor rows so we can update in place instead of
    // delete + re-insert (preserves proposal_text, show_as_line_item edits).
    const { data: existingBundleLabor, error: existingLaborError } = await supabase
      .from("bid_labor")
      .select("id, task, quantity, man_hours, bundle_run_id")
      .eq("bid_id", bidId)
      .not("bundle_run_id", "is", null);

    if (existingLaborError) {
      return NextResponse.json(
        { error: existingLaborError.message },
        { status: 500 }
      );
    }

    const existingLaborByTaskName = new Map(
      (existingBundleLabor || []).map((r: any) => [r.task, r])
    );

    // No longer deleting bundle materials upfront — we use delta-based updates
    // below so manual additions on top of bundle qty are preserved.

    const { data: questions, error: questionsError } = await supabase
      .from("scope_bundle_questions")
      .select("*")
      .eq("bundle_id", bundleId)
      .order("sort_order", { ascending: true });

    if (questionsError) {
      return NextResponse.json(
        { error: questionsError.message },
        { status: 500 }
      );
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("scope_bundle_tasks")
      .select("*")
      .eq("bundle_id", bundleId)
      .order("sort_order", { ascending: true });

    if (tasksError) {
      return NextResponse.json(
        { error: tasksError.message },
        { status: 500 }
      );
    }

    const questionsByKey = new Map<string, BundleQuestion>();
    for (const q of (questions || []) as BundleQuestion[]) {
      questionsByKey.set(q.question_key, q);
    }

    for (const q of (questions || []) as BundleQuestion[]) {
      if (q.required) {
        const val = getAnswer(answers, questionsByKey, q.question_key);
        if (val === null || val === undefined || String(val).trim() === "") {
          return NextResponse.json(
            { error: `${q.label} is required.` },
            { status: 400 }
          );
        }
      }
    }

    const { data: bundleRun, error: runError } = await supabase
      .from("scope_bundle_runs")
      .insert({
        company_id: bidRow.company_id,
        bid_id: bidId,
        bundle_id: bundleId,
        answers_json: answers,
      })
      .select("*")
      .single();

    if (runError || !bundleRun?.id) {
      return NextResponse.json(
        { error: runError?.message || "Failed to create bundle run." },
        { status: 500 }
      );
    }

    const insertedRows: any[] = [];
    const taskQuantityByBundleTaskId = new Map<string, number>();
    const processedTaskNames = new Set<string>();

    for (const task of (tasks || []) as BundleTask[]) {
      const computed = computeTask(task, answers, questionsByKey);

      if (computed.skip) continue;

      processedTaskNames.add(computed.taskName);
      const existing = existingLaborByTaskName.get(computed.taskName);

      if (existing) {
        // Update in place — preserves proposal_text, show_as_line_item, etc.
        const { data: updated, error: updateError } = await supabase
          .from("bid_labor")
          .update({
            quantity: computed.quantity,
            suggested_quantity: computed.quantity,
            unit: computed.unit,
            man_hours: computed.manHours,
            suggested_man_hours: computed.manHours,
            hourly_rate: hourlyRate,
            is_overridden: false,
            bundle_run_id: bundleRun.id,
            generated_by_rule: computed.generatedByRule,
            generated_from_question_keys: computed.generatedFromQuestionKeys,
          })
          .eq("id", existing.id)
          .select("*")
          .single();

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        insertedRows.push(updated);
      } else {
        // New task — insert fresh row.
        const payload = {
          company_id: bidRow.company_id,
          bid_id: bidId,
          task: computed.taskName,
          item: computed.itemName || computed.taskName,
          quantity: computed.quantity,
          suggested_quantity: computed.quantity,
          unit: computed.unit,
          man_hours: computed.manHours,
          suggested_man_hours: computed.manHours,
          hourly_rate: hourlyRate,
          show_as_line_item: computed.showAsLineItem,
          is_overridden: false,
          bundle_run_id: bundleRun.id,
          generated_by_rule: computed.generatedByRule,
          generated_from_question_keys: computed.generatedFromQuestionKeys,
        };

        const { data: inserted, error: insertError } = await supabase
          .from("bid_labor")
          .insert(payload)
          .select("*")
          .single();

        if (insertError) {
          return NextResponse.json(
            { error: insertError.message },
            { status: 500 }
          );
        }

        insertedRows.push(inserted);
      }

      taskQuantityByBundleTaskId.set(task.id, computed.quantity);
    }

    // Remove any old bundle labor rows whose tasks are no longer in this bundle.
    for (const [taskName, row] of existingLaborByTaskName) {
      if (!processedTaskNames.has(taskName)) {
        await supabase.from("bid_labor").delete().eq("id", (row as any).id);
      }
    }

    // =====================
    // MATERIALS INSERT
    // =====================

    const { data: materials, error: materialsError } = await supabase
      .from("scope_bundle_task_materials")
      .select(`
        material_id,
        qty_per_task_unit,
        unit,
        unit_cost,
        bundle_task_id,
        materials!inner(name),
        scope_bundle_tasks!inner(bundle_id)
      `)
      .eq("scope_bundle_tasks.bundle_id", bundleId);

    if (materialsError) {
      return NextResponse.json(
        { error: materialsError.message },
        { status: 500 }
      );
    }

    // Aggregate the new bundle qty by material_id across all bundle tasks.
    // We ADD the new bundle qty on top of whatever already exists — purely additive.
    type MatAdd = {
      name: string;
      unit: string;
      unit_cost: number;
      qty: number;
      source_task_id: string;
    };
    const matAddMap = new Map<string, MatAdd>();

    for (const m of materials || []) {
      const newTaskQty = taskQuantityByBundleTaskId.get(m.bundle_task_id) || 0;
      const qtyPerUnit = Number(m.qty_per_task_unit || 0);
      const addQty = Number((qtyPerUnit * newTaskQty).toFixed(2));

      if (addQty === 0) continue;

      const materialName = (m as any).materials?.[0]?.name || (m as any).materials?.name;
      const key = m.material_id;

      if (matAddMap.has(key)) {
        const d = matAddMap.get(key)!;
        matAddMap.set(key, { ...d, qty: Number((d.qty + addQty).toFixed(2)) });
      } else {
        matAddMap.set(key, {
          name: materialName || "Bundle Material",
          unit: m.unit,
          unit_cost: Number(m.unit_cost || 0),
          qty: addQty,
          source_task_id: m.bundle_task_id,
        });
      }
    }

    // Fetch existing bid_material rows to add onto.
    const { data: existingMats } = await supabase
      .from("bid_materials")
      .select("id, material_id, qty")
      .eq("bid_id", bidId)
      .not("material_id", "is", null);

    const existingByMaterialId = new Map(
      (existingMats || []).map((r: any) => [r.material_id, r])
    );

    for (const [materialId, d] of matAddMap) {
      const existing = existingByMaterialId.get(materialId);

      if (existing) {
        // Add bundle qty on top of existing qty — never overwrite.
        const newQty = Number((Number(existing.qty) + d.qty).toFixed(2));
        const { error: updateError } = await supabase
          .from("bid_materials")
          .update({ qty: newQty })
          .eq("id", existing.id);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      } else {
        // No existing row — insert fresh.
        const { error: insertMaterialError } = await supabase
          .from("bid_materials")
          .insert({
            bid_id: bidId,
            company_id: bidRow.company_id,
            name: d.name,
            material_id: materialId,
            qty: d.qty,
            unit: d.unit,
            unit_cost: d.unit_cost,
            source_type: "bundle",
            source_task_id: d.source_task_id,
          });

        if (insertMaterialError) {
          return NextResponse.json(
            { error: insertMaterialError.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      bundle_run: bundleRun,
      rows: insertedRows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to apply scope bundle." },
      { status: 500 }
    );
  }
}
