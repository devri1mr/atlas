import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET /api/operations-center/atlas-ops/lawn/job-time?job_id=xxx ──────────────
// Returns per-member time data for a production job.
export async function GET(req: NextRequest) {
  try {
    const jobId = new URL(req.url).searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });

    const sb = supabaseAdmin();

    const [
      { data: job, error: jobErr },
      { data: members, error: membersErr },
    ] = await Promise.all([
      sb.from("lawn_production_jobs")
        .select("id, work_order, service_date, actual_hours, budgeted_hours")
        .eq("id", jobId)
        .single(),
      sb.from("lawn_production_members")
        .select("id, resource_name, actual_hours, pay_rate, reg_hours, ot_hours")
        .eq("job_id", jobId)
        .order("resource_name"),
    ]);

    if (jobErr || !job) return NextResponse.json({ error: jobErr?.message ?? "Job not found" }, { status: 404 });
    if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 });

    // Find the dispatch job for this work_order + date
    const { data: dispatchJob } = await sb
      .from("lawn_dispatch_jobs")
      .select("id, start_time, end_time, time_varies")
      .eq("work_order", job.work_order)
      .eq("report_date", job.service_date)
      .maybeSingle();

    // Per-member dispatch times (only relevant when time_varies = true)
    let dispatchTimes: { id: string; resource_name: string; start_time: string; end_time: string }[] = [];
    if (dispatchJob?.id && dispatchJob.time_varies) {
      const { data } = await sb
        .from("lawn_dispatch_job_times")
        .select("id, resource_name, start_time, end_time")
        .eq("dispatch_job_id", dispatchJob.id);
      dispatchTimes = (data ?? []) as typeof dispatchTimes;
    }

    // Merge members with their times
    const merged = (members ?? []).map(m => {
      let startTime: string | null = null;
      let endTime:   string | null = null;
      let dtId:      string | null = null;

      if (dispatchJob) {
        if (dispatchJob.time_varies) {
          const dt = dispatchTimes.find(t => t.resource_name === m.resource_name);
          if (dt) { startTime = dt.start_time; endTime = dt.end_time; dtId = dt.id; }
        } else {
          // All members share the job-level time window
          startTime = dispatchJob.start_time;
          endTime   = dispatchJob.end_time;
        }
      }

      return {
        member_id:       m.id,
        resource_name:   m.resource_name,
        actual_hours:    Number(m.actual_hours   ?? 0),
        pay_rate:        Number(m.pay_rate        ?? 0),
        reg_hours:       Number(m.reg_hours       ?? 0),
        ot_hours:        Number(m.ot_hours        ?? 0),
        dispatch_time_id: dtId,
        dispatch_job_id:  dispatchJob?.id ?? null,
        time_varies:      dispatchJob?.time_varies ?? false,
        start_time:       startTime,
        end_time:         endTime,
      };
    });

    return NextResponse.json({
      job: {
        id:             job.id,
        work_order:     job.work_order,
        service_date:   job.service_date,
        actual_hours:   Number(job.actual_hours),
        budgeted_hours: Number(job.budgeted_hours),
        dispatch_job_id: dispatchJob?.id ?? null,
        time_varies:    dispatchJob?.time_varies ?? false,
      },
      members: merged,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// ── PATCH /api/operations-center/atlas-ops/lawn/job-time ───────────────────────
// Updates member times, recalculates job actual_hours + variance.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { job_id, members } = body as {
      job_id: string;
      members: {
        member_id:       string;
        resource_name:   string;
        actual_hours:    number;
        dispatch_time_id: string | null;
        dispatch_job_id:  string | null;
        time_varies:      boolean;
        start_time:       string | null;
        end_time:         string | null;
      }[];
    };

    if (!job_id || !Array.isArray(members)) {
      return NextResponse.json({ error: "job_id and members required" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Determine if all members share one dispatch job (time_varies = false)
    const sharedDispatchJobId = members[0]?.dispatch_job_id ?? null;
    const timeVaries          = members[0]?.time_varies ?? false;

    // Update dispatch times and member actual_hours
    for (const m of members) {
      const hrs = Number(m.actual_hours ?? 0);

      if (timeVaries) {
        // Per-member dispatch times
        if (m.start_time && m.end_time) {
          if (m.dispatch_time_id) {
            await sb.from("lawn_dispatch_job_times")
              .update({ start_time: m.start_time, end_time: m.end_time })
              .eq("id", m.dispatch_time_id);
          } else if (m.dispatch_job_id) {
            await sb.from("lawn_dispatch_job_times")
              .insert({ dispatch_job_id: m.dispatch_job_id, resource_name: m.resource_name, start_time: m.start_time, end_time: m.end_time });
          }
        }
      }
      // For time_varies=false: dispatch job times are updated once after this loop

      // Update member actual_hours
      await sb.from("lawn_production_members")
        .update({ actual_hours: hrs })
        .eq("id", m.member_id);
    }

    // For shared time window (time_varies = false): update the dispatch job itself
    if (!timeVaries && sharedDispatchJobId && members[0]?.start_time && members[0]?.end_time) {
      await sb.from("lawn_dispatch_jobs")
        .update({ start_time: members[0].start_time, end_time: members[0].end_time })
        .eq("id", sharedDispatchJobId);
    }

    // Recalculate job total from fresh member data
    const { data: freshMembers } = await sb
      .from("lawn_production_members")
      .select("actual_hours")
      .eq("job_id", job_id);

    const newActualHours = (freshMembers ?? []).reduce((s, m) => s + Number(m.actual_hours ?? 0), 0);

    const { data: jobRow } = await sb
      .from("lawn_production_jobs")
      .select("budgeted_hours")
      .eq("id", job_id)
      .single();

    await sb.from("lawn_production_jobs")
      .update({
        actual_hours:   newActualHours,
        variance_hours: newActualHours - Number(jobRow?.budgeted_hours ?? 0),
      })
      .eq("id", job_id);

    return NextResponse.json({ ok: true, new_actual_hours: newActualHours });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
