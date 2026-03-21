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
  const cleaned = s.replace(/\$/g, "").replace(/,/g, "").trim();
  return parseFloat(cleaned) || 0;
}

function getMonths(row: string[]): number[] {
  return row.slice(2, 14).map(parseMoney);
}

export async function GET() {
  try {
    const res = await fetch(SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const csv = await res.text();
    const rows = csv.split("\n").map(parseCSVLine);

    // Find rows by category + type label
    const find = (cat: string, type: string) =>
      rows.find(
        (r) =>
          r[0]?.trim().toUpperCase() === cat.toUpperCase() &&
          r[1]?.trim().toUpperCase() === type.toUpperCase()
      ) ?? [];

    const revActual   = find("REVENUE", "ACTUAL");
    const revBudget   = find("REVENUE", "BUDGETED");
    const matActual   = find("JOB MATERIALS", "ACTUAL");
    const matBudget   = find("JOB MATERIALS", "BUDGETED");
    const laborActual = find("LABOR", "ACTUAL");
    const laborBudget = find("LABOR", "BUDGETED");
    const fuelActual  = find("FUEL", "ACTUAL");
    const fuelBudget  = find("FUEL", "BUDGETED");
    const equipActual = find("EQUIPMENT", "ACTUAL");
    const equipBudget = find("EQUIPMENT", "BUDGETED");
    const profActual  = find("PROFIT", "ACTUAL");
    const profBudget  = find("PROFIT", "BUDGETED");
    const profBehindRow = rows.find((r) => r[0]?.trim().toUpperCase() === "PROFIT BEHIND") ?? [];

    const months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];

    return NextResponse.json({
      division: "Landscaping",
      lastFetched: new Date().toISOString(),
      months,
      revenue:   { actual: getMonths(revActual),   budget: getMonths(revBudget),   totalActual: parseMoney(revActual[14]),   totalBudget: parseMoney(revBudget[14]),   remaining: parseMoney(revActual[16]) },
      materials: { actual: getMonths(matActual),   budget: getMonths(matBudget),   totalActual: parseMoney(matActual[14]),   totalBudget: parseMoney(matBudget[14]) },
      labor:     { actual: getMonths(laborActual), budget: getMonths(laborBudget), totalActual: parseMoney(laborActual[14]), totalBudget: parseMoney(laborBudget[14]) },
      fuel:      { actual: getMonths(fuelActual),  budget: getMonths(fuelBudget),  totalActual: parseMoney(fuelActual[14]),  totalBudget: parseMoney(fuelBudget[14]) },
      equipment: { actual: getMonths(equipActual), budget: getMonths(equipBudget), totalActual: parseMoney(equipActual[14]), totalBudget: parseMoney(equipBudget[14]) },
      profit:    { actual: getMonths(profActual),  budget: getMonths(profBudget),  totalActual: parseMoney(profActual[14]),  totalBudget: parseMoney(profBudget[14]),  needed: parseMoney(profBudget[16]) },
      profitBehind: getMonths(profBehindRow),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
