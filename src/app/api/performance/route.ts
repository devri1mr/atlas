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

export async function GET() {
  try {
    const res = await fetch(SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const csv = await res.text();
    const rows = csv.split("\n").map(parseCSVLine);

    const find = (cat: string, type: string) =>
      rows.find(
        (r) =>
          r[0]?.trim().toUpperCase() === cat.toUpperCase() &&
          r[1]?.trim().toUpperCase() === type.toUpperCase()
      ) ?? [];

    const findPct = (cat: string) =>
      rows.find(
        (r) =>
          r[0]?.trim().toUpperCase() === cat.toUpperCase() &&
          r[1]?.trim() === "%"
      ) ?? [];

    const revActual    = find("REVENUE", "ACTUAL");
    const revBudget    = find("REVENUE", "BUDGETED");
    const matActual    = find("JOB MATERIALS", "ACTUAL");
    const matBudget    = find("JOB MATERIALS", "BUDGETED");
    const matPct       = findPct("JOB MATERIALS");
    const laborActual  = find("LABOR", "ACTUAL");
    const laborBudget  = find("LABOR", "BUDGETED");
    const laborPct     = findPct("LABOR");
    const fuelActual   = find("FUEL", "ACTUAL");
    const fuelBudget   = find("FUEL", "BUDGETED");
    const fuelPct      = findPct("FUEL");
    const equipActual  = find("EQUIPMENT", "ACTUAL");
    const equipBudget  = find("EQUIPMENT", "BUDGETED");
    const equipPct     = findPct("EQUIPMENT");
    const profActual   = find("PROFIT", "ACTUAL");
    const profBudget   = find("PROFIT", "BUDGETED");
    const profPct      = findPct("PROFIT");
    const profGoalRow  = rows.find((r) => r[1]?.trim().toUpperCase() === "GOAL:") ?? [];
    const profBehindRow = rows.find((r) => r[0]?.trim().toUpperCase() === "PROFIT BEHIND") ?? [];

    const months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];

    return NextResponse.json({
      division: "Landscaping",
      lastFetched: new Date().toISOString(),
      months,
      revenue: {
        actual: getMoneyMonths(revActual),
        budget: getMoneyMonths(revBudget),
        totalActual: parseMoney(revActual[14]),
        totalBudget: parseMoney(revBudget[14]),
        remaining: parseMoney(revActual[16]),
      },
      materials: {
        actual: getMoneyMonths(matActual),
        budget: getMoneyMonths(matBudget),
        pct: getPctMonths(matPct),
        totalActual: parseMoney(matActual[14]),
        totalBudget: parseMoney(matBudget[14]),
        totalPctActual: parsePct(matActual[15]),
        totalPctBudget: parsePct(matBudget[15]),
      },
      labor: {
        actual: getMoneyMonths(laborActual),
        budget: getMoneyMonths(laborBudget),
        pct: getPctMonths(laborPct),
        totalActual: parseMoney(laborActual[14]),
        totalBudget: parseMoney(laborBudget[14]),
        totalPctActual: parsePct(laborActual[15]),
        totalPctBudget: parsePct(laborBudget[15]),
      },
      fuel: {
        actual: getMoneyMonths(fuelActual),
        budget: getMoneyMonths(fuelBudget),
        pct: getPctMonths(fuelPct),
        totalActual: parseMoney(fuelActual[14]),
        totalBudget: parseMoney(fuelBudget[14]),
        totalPctActual: parsePct(fuelActual[15]),
        totalPctBudget: parsePct(fuelBudget[15]),
      },
      equipment: {
        actual: getMoneyMonths(equipActual),
        budget: getMoneyMonths(equipBudget),
        pct: getPctMonths(equipPct),
        totalActual: parseMoney(equipActual[14]),
        totalBudget: parseMoney(equipBudget[14]),
        totalPctActual: parsePct(equipActual[15]),
        totalPctBudget: parsePct(equipBudget[15]),
      },
      profit: {
        actual: getMoneyMonths(profActual),
        budget: getMoneyMonths(profBudget),
        pct: getPctMonths(profPct),
        goal: getPctMonths(profGoalRow),
        totalActual: parseMoney(profActual[14]),
        totalBudget: parseMoney(profBudget[14]),
        totalPctActual: parsePct(profActual[15]),
        totalPctBudget: parsePct(profBudget[15]),
        needed: parseMoney(profBudget[16]),
      },
      profitBehind: getMoneyMonths(profBehindRow),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
