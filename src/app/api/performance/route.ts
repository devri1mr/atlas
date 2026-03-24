import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ── Server-side sheet cache (per warm instance, 5-min TTL) ── */
const sheetCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

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

/* Detect column offset: if col C (index 2) is blank, months start at col D (offset=1) */
function monthOffset(row: string[]): number {
  return row[2]?.trim() === "" ? 1 : 0;
}

function getMoneyMonths(row: string[], offset = 0): number[] {
  return row.slice(2 + offset, 14 + offset).map(parseMoney);
}

function getPctMonths(row: string[], offset = 0): (number | null)[] {
  return row.slice(2 + offset, 14 + offset).map(parsePct);
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
  const cached = sheetCache.get(sheetUrl);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(sheetUrl, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

  /* Detect sheet column offset from the revenue actual row */
  const off = monthOffset(rev.actual);

  const build = (s: ReturnType<typeof findSection>) => ({
    actual:         getMoneyMonths(s.actual, off),
    budget:         getMoneyMonths(s.budget, off),
    pct:            getPctMonths(s.pct, off),
    totalActual:    parseMoney(s.actual[14 + off]),
    totalBudget:    parseMoney(s.budget[14 + off]),
    totalPctActual: parsePct(s.actual[15 + off]),
    totalPctBudget: parsePct(s.budget[15 + off]),
  });

  const result = {
    division:    divisionName,
    lastFetched: new Date().toISOString(),
    months,
    revenue: { ...build(rev), remaining: parseMoney(rev.actual[16 + off]) },
    materials: build(mat),
    labor:     build(labor),
    fuel:      build(fuel),
    equipment: build(equip),
    profit: { ...build(prof), goal: getPctMonths(prof.goal, off), needed: parseMoney(prof.budget[16 + off]) },
    profitBehind: getMoneyMonths(profBehindRow, off),
  };
  sheetCache.set(sheetUrl, { data: result, ts: Date.now() });
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const divisionId = searchParams.get("divisionId");
    const all = searchParams.get("all") === "1";

    const supabase = supabaseAdmin();

    if (all) {
      const { data: divisions, error } = await supabase
        .from("divisions")
        .select("id,name,performance_sheet_url,target_gross_profit_percent,active")
        .eq("active", true)
        .not("performance_sheet_url", "is", null)
        .order("name");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          await Promise.allSettled(
            (divisions ?? []).map(async (div) => {
              if (!div.performance_sheet_url) return;
              try {
                const data = await fetchSheetData(div.performance_sheet_url, div.name);
                const item = { divisionId: div.id, divisionName: div.name, targetGp: div.target_gross_profit_percent, data };
                controller.enqueue(enc.encode(JSON.stringify(item) + "\n"));
              } catch {
                // skip failed divisions silently
              }
            })
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
      });
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
