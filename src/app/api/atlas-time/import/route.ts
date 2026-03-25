import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

function normalize(s: string) {
  return s?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function fuzzyMatchDept(name: string, depts: { id: string; name: string }[]) {
  const n = normalize(name);
  // Exact
  let m = depts.find(d => normalize(d.name) === n);
  if (m) return m;
  // Starts-with either direction
  m = depts.find(d => normalize(d.name).startsWith(n) || n.startsWith(normalize(d.name)));
  return m ?? null;
}

function fuzzyMatchDiv(name: string, divs: { id: string; name: string }[]) {
  const n = normalize(name);
  let m = divs.find(d => normalize(d.name) === n);
  if (m) return m;
  m = divs.find(d => normalize(d.name).startsWith(n) || n.startsWith(normalize(d.name)));
  return m ?? null;
}

function excelDate(v: any): string | null {
  if (!v || typeof v !== "number") return null;
  try {
    return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0];
  } catch { return null; }
}

function parseBool(v: any): boolean | null {
  if (v == null || v === "") return null;
  const s = String(v).toLowerCase().trim();
  if (s === "yes" || s === "true" || s === "1" || s === "y") return true;
  if (s === "no" || s === "false" || s === "0" || s === "n") return false;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const rows: any[][] = body.rows ?? [];
    const dryRun: boolean = body.dry_run ?? false;

    if (!rows.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

    const headers: string[] = rows[0].map((h: any) => String(h ?? "").trim());
    const dataRows = rows.slice(1).filter((r: any[]) => r.some((c: any) => c != null && c !== ""));

    function col(row: any[], name: string) {
      const i = headers.indexOf(name);
      return i >= 0 ? row[i] : undefined;
    }

    // Load existing departments and divisions
    const [deptRes, companyDivRes, atDivRes] = await Promise.all([
      sb.from("at_departments").select("id, name").eq("company_id", companyId),
      sb.from("divisions").select("id, name").eq("active", true),
      sb.from("at_divisions").select("id, name").eq("company_id", companyId).eq("active", true),
    ]);

    const departments = deptRes.data ?? [];
    const allDivisions = [
      ...(companyDivRes.data ?? []),
      ...(atDivRes.data ?? []),
    ];

    // Load existing employees to avoid duplicates
    const { data: existingEmps } = await sb
      .from("at_employees")
      .select("first_name, last_name")
      .eq("company_id", companyId);

    const existingKeys = new Set(
      (existingEmps ?? []).map(e => `${normalize(e.first_name)}|${normalize(e.last_name)}`)
    );

    const results: { row: number; name: string; status: "imported" | "skipped" | "error"; reason?: string }[] = [];
    const toInsert: any[] = [];
    const divisionLinks: { employeeIndex: number; divisionId: string }[] = [];

    // Map dept/div name → missing sets for preview
    const unmatchedDepts = new Set<string>();
    const unmatchedDivs = new Set<string>();
    const matchedDeptNames = new Map<string, string>(); // name → id
    const matchedDivNames = new Map<string, string>();  // name → id

    for (let ri = 0; ri < dataRows.length; ri++) {
      const row = dataRows[ri];
      const firstName = String(col(row, "First Name") ?? "").trim();
      const lastName = String(col(row, "Last Name") ?? "").trim();

      if (!firstName || !lastName) {
        results.push({ row: ri + 2, name: "?", status: "skipped", reason: "Missing name" });
        continue;
      }

      const key = `${normalize(firstName)}|${normalize(lastName)}`;
      if (existingKeys.has(key)) {
        results.push({ row: ri + 2, name: `${firstName} ${lastName}`, status: "skipped", reason: "Already exists" });
        continue;
      }

      // Department matching
      const deptName = String(col(row, "Department") ?? "").trim();
      let deptId: string | null = null;
      if (deptName) {
        if (matchedDeptNames.has(deptName)) {
          deptId = matchedDeptNames.get(deptName)!;
        } else {
          const match = fuzzyMatchDept(deptName, departments);
          if (match) {
            deptId = match.id;
            matchedDeptNames.set(deptName, match.id);
          } else {
            unmatchedDepts.add(deptName);
          }
        }
      }

      // Division matching (Class column)
      const divName = String(col(row, "Class") ?? "").trim();
      let divId: string | null = null;
      if (divName) {
        if (matchedDivNames.has(divName)) {
          divId = matchedDivNames.get(divName)!;
        } else {
          const match = fuzzyMatchDiv(divName, allDivisions);
          if (match) {
            divId = match.id;
            matchedDivNames.set(divName, match.id);
          } else {
            unmatchedDivs.add(divName);
          }
        }
      }

      // Status
      const activeRaw = col(row, "Active");
      const leaveDate = excelDate(col(row, "Leave Date"));
      const status = leaveDate ? "inactive" : (activeRaw != null && String(activeRaw).toLowerCase() === "no" ? "inactive" : "active");

      const emp: Record<string, any> = {
        company_id: companyId,
        first_name: firstName,
        last_name: lastName,
        middle_initial: String(col(row, "M.I.") ?? "").trim() || null,
        phone: String(col(row, "Main Phone") ?? "").trim() || null,
        personal_email: String(col(row, "Main Email") ?? "").trim() || null,
        address_line1: String(col(row, "Street1") ?? "").trim() || null,
        address_line2: String(col(row, "Street2") ?? "").trim() || null,
        city: String(col(row, "City") ?? "").trim() || null,
        state: String(col(row, "State") ?? "").trim() || null,
        zip: String(col(row, "Zip") ?? col(row, "Zip Code") ?? "").trim() || null,
        hire_date: excelDate(col(row, "Hire Date")),
        first_working_day: excelDate(col(row, "1st Working Day")),
        job_title: String(col(row, "Current Position") ?? "").trim() || null,
        department_id: deptId,
        division_id: divId,
        t_shirt_size: String(col(row, "Shirt Size") ?? "").trim() || null,
        date_of_birth: excelDate(col(row, "Birthday")),
        i9_on_file: parseBool(col(row, "I9 On File")),
        cpr_expiration: excelDate(col(row, "CPR Expiration")),
        first_aid_expiration: excelDate(col(row, "First Aid Expiration")),
        health_care_plan: String(col(row, "Health Care Plan") ?? "").trim() || null,
        electronic_devices: col(row, "Electronic Devices") ? [String(col(row, "Electronic Devices")).trim()] : [],
        is_driver: parseBool(col(row, "Driver")),
        license_type: String(col(row, "License Type") ?? "").trim() || null,
        drivers_license_number: String(col(row, "Driver's License #") ?? "").trim() || null,
        drivers_license_expiration: excelDate(col(row, "Driver's License Expiration")),
        dot_card_expiration: excelDate(col(row, "DOT Card Expiration")),
        fert_license_expiration: excelDate(col(row, "Fert License Expiration")),
        pto_plan: String(col(row, "PTO Plan") ?? "").trim() || null,
        status,
        termination_date: leaveDate,
        termination_reason: String(col(row, "Reason for Leaving") ?? "").trim() || null,
        eligible_for_rehire: parseBool(col(row, "Eligible for Rehire")),
        pay_type: "hourly",
      };

      toInsert.push(emp);
      if (divId) divisionLinks.push({ employeeIndex: toInsert.length - 1, divisionId: divId });
      results.push({ row: ri + 2, name: `${firstName} ${lastName}`, status: "imported" });
      existingKeys.add(key);
    }

    // Return preview without writing
    if (dryRun) {
      return NextResponse.json({
        total: dataRows.length,
        to_import: toInsert.length,
        skipped: results.filter(r => r.status === "skipped").length,
        unmatched_depts: [...unmatchedDepts],
        unmatched_divs: [...unmatchedDivs],
        preview: results.slice(0, 10),
      });
    }

    // Insert in batches of 50
    let imported = 0;
    const insertedIds: string[] = [];
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { data, error } = await sb
        .from("at_employees")
        .insert(batch)
        .select("id");
      if (error) {
        return NextResponse.json({ error: error.message, imported }, { status: 500 });
      }
      (data ?? []).forEach((d: any) => insertedIds.push(d.id));
      imported += batch.length;
    }

    // Insert division links
    if (insertedIds.length > 0 && divisionLinks.length > 0) {
      const links = divisionLinks
        .filter(l => l.employeeIndex < insertedIds.length)
        .map(l => ({
          employee_id: insertedIds[l.employeeIndex],
          division_id: divisionLinks.find(d => d.employeeIndex === l.employeeIndex)?.divisionId,
          is_primary: true,
        }))
        .filter(l => l.division_id);

      if (links.length > 0) {
        await sb.from("at_employee_divisions").insert(links);
      }
    }

    return NextResponse.json({
      imported,
      skipped: results.filter(r => r.status === "skipped").length,
      unmatched_depts: [...unmatchedDepts],
      unmatched_divs: [...unmatchedDivs],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
