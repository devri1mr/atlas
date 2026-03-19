import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function roundUp(value: number, increment: number) {
  if (increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);
    const project_id = Number(url.searchParams.get("project_id"));
    const margin_override = url.searchParams.get("margin_override"); // e.g. 0.55
    const prepay = url.searchParams.get("prepay") === "true";

    if (!Number.isFinite(project_id)) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });

    const { data: project, error: pErr } = await supabase.from("atlas_projects").select("*").eq("id", project_id).single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const division_id = project.division_id ?? 1;

    const [{ data: laborRows }, { data: laborMeta }, { data: matRows }, { data: settings }] = await Promise.all([
      supabase.from("atlas_project_labor").select("*").eq("project_id", project_id),
      supabase.from("atlas_project_labor_meta").select("*").eq("project_id", project_id).single(),
      supabase.from("atlas_project_materials").select("*").eq("project_id", project_id),
      supabase.from("atlas_bid_settings").select("*").eq("division_id", division_id).single(),
    ]);

    const trucking_hours = Number(laborMeta?.trucking_hours ?? 0);
    const additional_hours = Number(laborMeta?.additional_hours ?? 0);
    const ot_percent = Math.max(0, Math.min(100, Number(laborMeta?.ot_percent ?? 0)));

    // Labor cost: uses your division labor rates table. If a row has job_role_id, use that.
    // If no job_role_id, labor cost = 0 (forces you to pick a role for costing).
    const rateMap = new Map<number, number>();
    const { data: rates } = await supabase
      .from("division_labor_rates")
      .select("job_role_id, hourly_rate, division_id")
      .eq("division_id", division_id);

    (rates ?? []).forEach((r: any) => {
      if (typeof r.job_role_id === "number") rateMap.set(r.job_role_id, Number(r.hourly_rate ?? 0));
    });

    const labor_hours = (laborRows ?? []).reduce((sum: number, r: any) => sum + Number(r.man_hours ?? 0), 0);
    const total_hours = labor_hours + trucking_hours + additional_hours;

    const labor_cost_base = (laborRows ?? []).reduce((sum: number, r: any) => {
      const hrs = Number(r.man_hours ?? 0);
      const roleId = r.job_role_id;
      const rate = roleId ? (rateMap.get(Number(roleId)) ?? 0) : 0;
      return sum + hrs * rate;
    }, 0);

    // OT uplift (simple): OT% of total labor cost gets 0.5 multiplier (time-and-a-half)
    const ot_uplift = labor_cost_base * (ot_percent / 100) * 0.5;
    const labor_cost = labor_cost_base + ot_uplift;

    const materials_cost = (matRows ?? []).reduce((sum: number, r: any) => sum + Number(r.total_cost ?? 0), 0);

    const cost_subtotal = labor_cost + materials_cost;

    const margin_default = Number(settings?.margin_default ?? 0.5);
    const contingency_pct = Number(settings?.contingency_pct ?? 0.03);
    const round_up_increment = Number(settings?.round_up_increment ?? 100);
    const prepay_discount_pct = Number(settings?.prepay_discount_pct ?? 0.03);

    const margin = margin_override ? Number(margin_override) : margin_default;

    const cost_with_contingency = cost_subtotal * (1 + contingency_pct);

    // price = cost / (1 - margin)
    const raw_price = margin >= 1 ? cost_with_contingency : cost_with_contingency / (1 - margin);

    const rounded_price = roundUp(raw_price, round_up_increment);

    const final_price = prepay ? rounded_price * (1 - prepay_discount_pct) : rounded_price;

    return NextResponse.json({
      project,
      totals: {
        labor_hours,
        trucking_hours,
        additional_hours,
        total_hours,
        labor_cost_base,
        ot_percent,
        ot_uplift,
        labor_cost,
        materials_cost,
        cost_subtotal,
      },
      settings_used: {
        margin_default,
        margin_used: margin,
        contingency_pct,
        round_up_increment,
        prepay_discount_pct,
        prepay_applied: prepay,
      },
      pricing: {
        raw_price,
        rounded_price,
        final_price,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}