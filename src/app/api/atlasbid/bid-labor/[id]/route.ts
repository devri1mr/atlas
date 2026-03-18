import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function recalcBidMaterialDisplayQty(
  supabase: ReturnType<typeof getSupabase>,
  bidId: string,
  materialId: string,
  unit: string
) {
  const { data: contributionRows, error: contributionError } = await supabase
    .from("bid_material_contributions")
    .select("qty")
    .eq("bid_id", bidId)
    .eq("material_id", materialId)
    .eq("unit", unit);

  if (contributionError) {
    throw new Error(contributionError.message);
  }

  const totalQty = Number(
    (contributionRows || [])
      .reduce((sum, r) => sum + toNumber(r.qty, 0), 0)
      .toFixed(2)
  );

  const { data: materialRows, error: materialRowsError } = await supabase
    .from("bid_materials")
    .select("id, qty, unit_cost")
    .eq("bid_id", bidId)
    .eq("material_id", materialId)
    .eq("unit", unit)
    .order("created_at", { ascending: true })
    .limit(1);

  if (materialRowsError) {
    throw new Error(materialRowsError.message);
  }

  const materialRow =
    Array.isArray(materialRows) && materialRows.length > 0
      ? materialRows[0]
      : null;

  if (!materialRow) return;

  const { error: updateError } = await supabase
    .from("bid_materials")
    .update({
      qty: totalQty,
    })
    .eq("id", materialRow.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await ctx.params;

  const rowId = String(id || "").trim();
  if (!rowId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("bid_labor")
    .select(
      `
      id,
      bid_id,
      company_id,
      task_catalog_id,
      task,
      item,
      proposal_text,
      quantity,
      unit,
      man_hours,
      hourly_rate,
      show_as_line_item,
      bundle_run_id,
      created_at
      `
    )
    .eq("id", rowId)
    .single();

  if (existingError || !existingRow) {
    return NextResponse.json(
      { error: existingError?.message || "Labor row not found" },
      { status: 404 }
    );
  }

  const updates: Record<string, any> = {};

  if ("task" in body) updates.task = String(body.task ?? "").trim();
  if ("item" in body) updates.item = String(body.item ?? "").trim();
  if ("proposal_text" in body) {
    updates.proposal_text = String(body.proposal_text ?? "").trim();
  }
  if ("quantity" in body) updates.quantity = toNumber(body.quantity, 0);
  if ("unit" in body) updates.unit = String(body.unit ?? "").trim();
  if ("man_hours" in body) updates.man_hours = toNumber(body.man_hours, 0);
  if ("hourly_rate" in body) updates.hourly_rate = toNumber(body.hourly_rate, 0);
  if ("show_as_line_item" in body) {
    updates.show_as_line_item = body.show_as_line_item;
  }
  if ("task_catalog_id" in body) {
    updates.task_catalog_id =
      typeof body.task_catalog_id === "string" && body.task_catalog_id.trim()
        ? body.task_catalog_id.trim()
        : null;
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("bid_labor")
    .update(updates)
    .eq("id", rowId)
    .select(
      `
      id,
      bid_id,
      company_id,
      task_catalog_id,
      task,
      item,
      proposal_text,
      quantity,
      unit,
      man_hours,
      hourly_rate,
      show_as_line_item,
      bundle_run_id,
      created_at
      `
    )
    .single();

  if (updateError || !updatedRow) {
    return NextResponse.json(
      { error: updateError?.message || "Failed to update labor row" },
      { status: 500 }
    );
  }

  const shouldRecalcMaterials =
    ("quantity" in body || "task_catalog_id" in body) &&
    !!updatedRow.task_catalog_id &&
    !!updatedRow.bid_id &&
    !!updatedRow.company_id;

  if (shouldRecalcMaterials) {
    const { data: templateRows, error: templateError } = await supabase
      .from("task_template_materials")
      .select(
        `
        id,
        task_catalog_id,
        material_id,
        qty_per_task_unit,
        unit,
        unit_cost,
        details
        `
      )
      .eq("task_catalog_id", updatedRow.task_catalog_id);

    if (templateError) {
      return NextResponse.json(
        { error: templateError.message },
        { status: 500 }
      );
    }

    if (templateRows && templateRows.length > 0) {
      const materialIds = templateRows.map((r) => r.material_id).filter(Boolean);

      const { data: catalogRows, error: catalogError } = await supabase
        .from("materials_catalog")
        .select(
          `
          id,
          name,
          default_unit,
          default_unit_cost
          `
        )
        .in("id", materialIds);

      if (catalogError) {
        return NextResponse.json(
          { error: catalogError.message },
          { status: 500 }
        );
      }

      const catalogMap = new Map((catalogRows || []).map((r) => [r.id, r]));

      for (const tm of templateRows) {
        const catalog = catalogMap.get(tm.material_id);
        if (!catalog?.id || !catalog?.name) continue;

        const resolvedUnit = String(
          tm.unit || catalog.default_unit || "ea"
        ).trim();

        const resolvedUnitCost =
          tm.unit_cost !== null && tm.unit_cost !== undefined
            ? toNumber(tm.unit_cost, 0)
            : toNumber(catalog.default_unit_cost, 0);

        const laborQty = toNumber(updatedRow.quantity, 0);
        const qtyPerTaskUnit = toNumber(tm.qty_per_task_unit, 0);
        const contributionQty = Number((laborQty * qtyPerTaskUnit).toFixed(2));

        const { error: contributionUpsertError } = await supabase
          .from("bid_material_contributions")
          .upsert(
            {
              bid_id: updatedRow.bid_id,
              labor_row_id: updatedRow.id,
              material_id: catalog.id,
              material_name: catalog.name,
              unit: resolvedUnit,
              qty: contributionQty,
              unit_cost: resolvedUnitCost,
            },
            {
              onConflict: "labor_row_id,material_id,unit",
            }
          );

        if (contributionUpsertError) {
          return NextResponse.json(
            { error: contributionUpsertError.message },
            { status: 500 }
          );
        }

        const { data: existingMaterialRows, error: existingMaterialError } =
          await supabase
            .from("bid_materials")
            .select(
              `
              id,
              bid_id,
              material_id,
              name,
              details,
              qty,
              unit,
              unit_cost,
              source_type,
              source_task_id,
              created_at
              `
            )
            .eq("bid_id", updatedRow.bid_id)
            .eq("material_id", catalog.id)
            .eq("unit", resolvedUnit)
            .order("created_at", { ascending: true })
            .limit(1);

        if (existingMaterialError) {
          return NextResponse.json(
            { error: existingMaterialError.message },
            { status: 500 }
          );
        }

        const existingMaterialRow =
          Array.isArray(existingMaterialRows) && existingMaterialRows.length > 0
            ? existingMaterialRows[0]
            : null;

        if (existingMaterialRow) {
          const { error: materialUpdateError } = await supabase
            .from("bid_materials")
            .update({
              unit_cost:
                existingMaterialRow.unit_cost !== null &&
                existingMaterialRow.unit_cost !== undefined
                  ? toNumber(existingMaterialRow.unit_cost, 0)
                  : resolvedUnitCost,
            })
            .eq("id", existingMaterialRow.id);

          if (materialUpdateError) {
            return NextResponse.json(
              { error: materialUpdateError.message },
              { status: 500 }
            );
          }
        } else if (contributionQty > 0) {
          const { error: materialInsertError } = await supabase
            .from("bid_materials")
            .insert({
              company_id: updatedRow.company_id,
              bid_id: updatedRow.bid_id,
              material_id: catalog.id,
              name: catalog.name,
              details: tm.details ?? null,
              qty: contributionQty,
              unit: resolvedUnit,
              unit_cost: resolvedUnitCost,
              source_type: "template",
              source_task_id: updatedRow.task_catalog_id,
            });

          if (materialInsertError) {
            return NextResponse.json(
              { error: materialInsertError.message },
              { status: 500 }
            );
          }
        }

        await recalcBidMaterialDisplayQty(
          supabase,
          updatedRow.bid_id,
          catalog.id,
          resolvedUnit
        );
      }
    }
  }

  // When qty changes on a bundle-generated labor row, recalculate the qty
  // for any bid_materials that came from the same bundle task.
  const shouldRecalcBundleMaterials =
    "quantity" in body &&
    !!updatedRow.bundle_run_id &&
    !!updatedRow.bid_id;

  if (shouldRecalcBundleMaterials) {
    const { data: bundleRun } = await supabase
      .from("scope_bundle_runs")
      .select("bundle_id")
      .eq("id", updatedRow.bundle_run_id)
      .maybeSingle();

    if (bundleRun?.bundle_id) {
      const { data: bundleTask } = await supabase
        .from("scope_bundle_tasks")
        .select("id")
        .eq("bundle_id", bundleRun.bundle_id)
        .eq("task_name", updatedRow.task)
        .maybeSingle();

      if (bundleTask?.id) {
        const { data: taskMaterials } = await supabase
          .from("scope_bundle_task_materials")
          .select("material_id, qty_per_task_unit, unit")
          .eq("bundle_task_id", bundleTask.id);

        const newLaborQty = toNumber(updatedRow.quantity, 0);

        for (const tm of taskMaterials || []) {
          const newMatQty = Number(
            (toNumber(tm.qty_per_task_unit, 0) * newLaborQty).toFixed(2)
          );

          const { data: matRows } = await supabase
            .from("bid_materials")
            .select("id")
            .eq("bid_id", updatedRow.bid_id)
            .eq("material_id", tm.material_id)
            .limit(1);

          if (matRows?.[0] && newMatQty >= 0) {
            await supabase
              .from("bid_materials")
              .update({ qty: newMatQty })
              .eq("id", matRows[0].id);
          }
        }
      }
    }
  }

  return NextResponse.json({ row: updatedRow });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await ctx.params;

  const rowId = String(id || "").trim();
  if (!rowId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data: laborRow, error: laborRowError } = await supabase
    .from("bid_labor")
    .select("id, bid_id, task_catalog_id")
    .eq("id", rowId)
    .single();

  if (laborRowError || !laborRow) {
    return NextResponse.json(
      { error: laborRowError?.message || "Labor row not found" },
      { status: 404 }
    );
  }

  const affectedKeys: Array<{ bid_id: string; material_id: string; unit: string }> = [];

  const { data: contributionRows, error: contributionRowsError } = await supabase
    .from("bid_material_contributions")
    .select("bid_id, material_id, unit")
    .eq("labor_row_id", rowId);

  if (contributionRowsError) {
    return NextResponse.json(
      { error: contributionRowsError.message },
      { status: 500 }
    );
  }

  for (const row of contributionRows || []) {
    if (row?.bid_id && row?.material_id && row?.unit) {
      affectedKeys.push({
        bid_id: row.bid_id,
        material_id: row.material_id,
        unit: row.unit,
      });
    }
  }

  const { error: contributionDeleteError } = await supabase
    .from("bid_material_contributions")
    .delete()
    .eq("labor_row_id", rowId);

  if (contributionDeleteError) {
    return NextResponse.json(
      { error: contributionDeleteError.message },
      { status: 500 }
    );
  }

  const { error: laborDeleteError } = await supabase
    .from("bid_labor")
    .delete()
    .eq("id", rowId);

  if (laborDeleteError) {
    return NextResponse.json(
      { error: laborDeleteError.message },
      { status: 500 }
    );
  }

  for (const key of affectedKeys) {
    await recalcBidMaterialDisplayQty(
      supabase,
      key.bid_id,
      key.material_id,
      key.unit
    );
  }

  return NextResponse.json({ ok: true });
}
