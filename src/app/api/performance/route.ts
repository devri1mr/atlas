import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

function parseMoney(s: string): number {
  if (!s || s === "#REF!" || s.trim() === "") return 0;
  return parseFloat(s.replace(/\$/g, "").replace(/,/g, "").trim()) || 0;
}

function parsePct(s: string): number | null {
  if (!s || s === "#REF!" || s.trim() === "") return null;
  const n = parseFloat(s.replace("%", "").trim());
  return isNaN(n) ? null : n;
}

function getMoneyMonths(row: string[]): number[] {
  return row.slice(2, 14).map(parseMoney);
}

function getPctMonths(row: string[]): (number | null)[] {
  return row.slice(2, 14).map(parsePct);
}

function findSection(rows: string[][], cat: string) {
  const actualIdx = rows.findIndex(
    (r) => r[0]?.trim().toUpperCase() === cat.toUpperCase()
  );
  if (actualIdx === -1) return { actual: [] as string[], budget: [] as string[], pct: [] as string[], goal: [] as string[] };

  const actual: string[] = rows[actualIdx];
  let budget: string[] = [];
  let pct:    string[] = [];
  let goal:   string[] = [];

  for (let j = actualIdx + 1; j < Math.min(actualIdx + 6, rows.length); j++) {
    const r    = rows[j];
    const col1 = r[1]?.trim().toUpperCase();
    const col0 = r[0]?.trim();
    if (col0 && col0.toUpperCase() !== cat.toUpperCase() && col1 !== "BUDGETED" && col1 !== "%" && col1 !== "GOAL:") break;
    if (col1 === "BUDGETED") budget = r;
    else if (col1 === "%")    pct    = r;
    else if (col1 === "GOAL:") goal  = r;
  }
  return { actual, budget, pct, goal };
}

async function fetchSheetData(sheetUrl: string, divisionName: string) {
  const res = await fetch(sheetUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed for ${divisionName}: ${res.status}`);

  const csv  = await res.text();
  const rows = csv.split("\n").map(parseCSVLine);

  const rev   = findSection(rows, "REVENUE");
  const mat   = findSection(rows, "JOB MATERIALS");
  const labor = findSection(rows, "LABOR");
  const fuel  = findSection(rows, "FUEL");
  const equip = findSection(rows, "EQUIPMENT");
  const prof  = findSection(rows, "PROFIT");
  const profBehindRow = rows.find((r) => r[0]?.trim().toUpperCase() === "PROFIT BEHIND") ?? [];

  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  const build = (s: ReturnType<typeof findSection>) => ({
    actual:         getMoneyMonths(s.actual),
    budget:         getMoneyMonths(s.budget),
    pct:            getPctMonths(s.pct),
    totalActual:    parseMoney(s.actual[14]),
    totalBudget:    parseMoney(s.budget[14]),
    totalPctActual: parsePct(s.actual[15]),
    totalPctBudget: parsePct(s.budget[15]),
  });

  return {
    division:    divisionName,
    lastFetched: new Date().toISOString(),
    months,
    revenue: { ...build(rev), remaining: parseMoney(rev.actual[16]) },
    materials: build(mat),
    labor:     build(labor),
    fuel:      build(fuel),
    equipment: build(equip),
    profit: { ...build(prof), goal: getPctMonths(prof.goal), needed: parseMoney(prof.budget[16]) },
    profitBehind: getMoneyMonths(profBehindRow),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const divisionId = searchParams.get("divisionId");
    const all = searchParams.get("all") === "1";

    const supabase = supabaseAdmin();

    if (all) {
      // Fetch all active divisions that have a performance sheet URL
      const { data: divisions, error } = await supabase
        .from("divisions")
        .select("id,name,performance_sheet_url,target_gross_profit_percent,active")
        .eq("active", true)
        .not("performance_sheet_url", "is", null)
        .order("name");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const results = await Promise.allSettled(
        (divisions ?? []).map(async (div) => {
          if (!div.performance_sheet_url) return null;
          const data = await fetchSheetData(div.performance_sheet_url, div.name);
          return { divisionId: div.id, divisionName: div.name, targetGp: div.target_gross_profit_percent, data };
        })
      );

      const items = results
        .map((r, i) => r.status === "fulfilled" ? r.value : null)
        .filter(Boolean);

      return NextResponse.json({ items });
    }

    if (divisionId) {
      const { data: div, error } = await supabase
        .from("divisions")
        .select("id,name,performance_sheet_url,target_gross_profit_percent")
        .eq("id", divisionId)
        .single();

      if (error || !div) return NextResponse.json({ error: "Division not found" }, { status: 404 });
      if (!div.performance_sheet_url) return NextResponse.json({ error: "No performance sheet configured for this division" }, { status: 400 });

      const data = await fetchSheetData(div.performance_sheet_url, div.name);
      return NextResponse.json({ ...data, targetGp: div.target_gross_profit_percent });
    }

    return NextResponse.json({ error: "Provide ?divisionId=<id> or ?all=1" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
