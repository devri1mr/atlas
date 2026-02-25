import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function makeProjectCode() {
  // simple tracking-ready code: ATLAS-YYYYMMDD-HHMMSS-RAND
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const code =
    `ATLAS-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
    Math.random().toString(36).slice(2, 6).toUpperCase();
  return code;
}

// List projects (recent first)
export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("atlas_projects")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ projects: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Create new project (draft)
export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const client_name = String(body?.client_name ?? "").trim();
    const project_name = String(body?.project_name ?? "").trim();
    const project_address = String(body?.project_address ?? "").trim();
    const created_by_email = String(body?.created_by_email ?? "").trim() || null;

    if (!client_name || !project_name || !project_address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const project_code = makeProjectCode();

    const { data, error } = await supabase
      .from("atlas_projects")
      .insert([
        {
          project_code,
          division_id: 1,
          client_name,
          project_name,
          project_address,
          status: "draft",
          created_by_email,
        },
      ])
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ensure labor meta row exists
    await supabase.from("atlas_project_labor_meta").upsert([{ project_id: data.id }], { onConflict: "project_id" });

    return NextResponse.json({ project: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}