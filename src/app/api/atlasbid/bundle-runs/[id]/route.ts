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

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function toNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// PATCH /api/atlasbid/bundle-runs/[id]
// Updates display_name stored in answers_json._display_name
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    const { id: runId } = await ctx.params;
    if (!runId) return NextResponse.json({ error: "Missing run id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const displayName = String(body?.display_name ?? "").trim();

    const { data: run } = await supabase
      .from("scope_bundle_runs")
      .select("answers_json")
      .eq("id", runId)
      .single();

    const updated = { ...(run?.answers_json || {}), _display_name: displayName || null };

    const { error } = await supabase
      .from("scope_bundle_runs")
      .update({ answers_json: updated })
      .eq("id", runId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update bundle run." }, { status: 500 });
  }
}

// DELETE /api/atlasbid/bundle-runs/[id]
// Removes all labor rows for the bundle run and subtracts their material
// contributions from bid_materials, then deletes the run record itself.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    const { id: runId } = await ctx.params;

    if (!runId) {
      return NextResponse.json({ error: "Missing run id" }, { status: 400 });
    }

    // 1. Get the bundle run so we know bundle_id and bid_id.
    const { data: run, error: runError } = await supabase
      .from("scope_bundle_runs")
      .select("id, bundle_id, bid_id")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { error: runError?.message || "Bundle run not found" },
        { status: 404 }
      );
    }

    const { bundle_id: bundleId, bid_id: bidId } = run;

    // 2. Get all labor rows for this run.
    const { data: laborRows, error: laborError } = await supabase
      .from("bid_labor")
      .select("id, task, quantity")
      .eq("bundle_run_id", runId);

    if (laborError) {
      return NextResponse.json({ error: laborError.message }, { status: 500 });
    }

    // 3. For each labor row, compute how much it contributed to each material
    //    and subtract that from bid_materials.
    if (laborRows && laborRows.length > 0 && bundleId) {
      // Aggregate material contributions across all labor rows in this run.
      const matSubtractMap = new Map<string, number>();

      for (const lr of laborRows) {
        // Find the bundle task for this labor row's task name.
        const { data: bundleTask } = await supabase
          .from("scope_bundle_tasks")
          .select("id")
          .eq("bundle_id", bundleId)
          .eq("task_name", lr.task)
          .maybeSingle();

        if (!bundleTask?.id) continue;

        const { data: taskMaterials } = await supabase
          .from("scope_bundle_task_materials")
          .select("material_id, qty_per_task_unit")
          .eq("bundle_task_id", bundleTask.id);

        for (const tm of taskMaterials || []) {
          const contributed = Number(
            (toNumber(tm.qty_per_task_unit, 0) * toNumber(lr.quantity, 0)).toFixed(2)
          );
          if (contributed === 0) continue;

          matSubtractMap.set(
            tm.material_id,
            Number(
              ((matSubtractMap.get(tm.material_id) || 0) + contributed).toFixed(2)
            )
          );
        }
      }

      // Apply subtractions to bid_materials.
      if (matSubtractMap.size > 0) {
        const materialIds = Array.from(matSubtractMap.keys());

        const { data: matRows } = await supabase
          .from("bid_materials")
          .select("id, material_id, qty")
          .eq("bid_id", bidId)
          .in("material_id", materialIds);

        for (const mat of matRows || []) {
          const subtract = matSubtractMap.get(mat.material_id) || 0;
          const newQty = Number((toNumber(mat.qty, 0) - subtract).toFixed(2));

          if (newQty <= 0) {
            // Remove the row entirely — bundle was the only contributor
            await supabase.from("bid_materials").delete().eq("id", mat.id);
          } else {
            await supabase.from("bid_materials").update({ qty: newQty }).eq("id", mat.id);
          }
        }
      }
    }

    // 4. Delete all labor rows for this run.
    const { error: deleteLaborError } = await supabase
      .from("bid_labor")
      .delete()
      .eq("bundle_run_id", runId);

    if (deleteLaborError) {
      return NextResponse.json({ error: deleteLaborError.message }, { status: 500 });
    }

    // 5. Delete the bundle run record.
    const { error: deleteRunError } = await supabase
      .from("scope_bundle_runs")
      .delete()
      .eq("id", runId);

    if (deleteRunError) {
      return NextResponse.json({ error: deleteRunError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete bundle run." },
      { status: 500 }
    );
  }
}
