import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KqjRfFS6EF9wOC564D4r8VuIhz7oQFhzGPP4zFSZJr0/export?format=csv&gid=1763692451";

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

// Find the ACTUAL row by category name in col 0, then collect
// BUDGETED / % / GOAL: from the rows immediately following it.
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
    const r   = rows[j];
    const col1 = r[1]?.trim().toUpperCase();
    const col0 = r[0]?.trim();
    // Stop if a new section starts (non-empty col0 that isn't current cat)
    if (col0 && col0.toUpperCase() !== cat.toUpperCase() && col1 !== "BUDGETED" && col1 !== "%" && col1 !== "GOAL:") break;
    if (col1 === "BUDGETED") budget = r;
    else if (col1 === "%")    pct    = r;
    else if (col1 === "GOAL:") goal  = r;
  }
  return { actual, budget, pct, goal };
}

export async function GET() {
  try {
    const res = await fetch(SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

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

    return NextResponse.json({
      division:    "Landscaping",
      lastFetched: new Date().toISOString(),
      months,
      revenue: {
        ...build(rev),
        remaining: parseMoney(rev.actual[16]),
      },
      materials: build(mat),
      labor:     build(labor),
      fuel:      build(fuel),
      equipment: build(equip),
      profit: {
        ...build(prof),
        goal:   getPctMonths(prof.goal),
        needed: parseMoney(prof.budget[16]),
      },
      profitBehind: getMoneyMonths(profBehindRow),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
