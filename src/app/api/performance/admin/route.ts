import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Fh2tkEfy-yuGJ9lbXpAufvuWL5k-RVnb26hk61ZE9OE/export?format=csv&gid=1126741187";

const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

/* Simple CSV line parser (handles quoted commas) */
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
  if (!s || s.trim() === "") return 0;
  return parseFloat(s.replace(/\$/g, "").replace(/,/g, "").trim()) || 0;
}

/* In-memory cache (5-min TTL) */
let cache: { data: { actual: number[]; budget: number[] }; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(SHEET_URL, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const csv  = await res.text();
    const rows = csv.split("\n").map(parseCSVLine);

    const actual: number[] = new Array(12).fill(0);
    const budget: number[] = new Array(12).fill(0);

    let currentMonthIdx = -1;

    for (const row of rows) {
      const col0 = row[0]?.trim().toLowerCase();
      const monthIdx = MONTHS.indexOf(col0);
      if (monthIdx !== -1) {
        currentMonthIdx = monthIdx;
        continue;
      }
      if (currentMonthIdx !== -1 && col0 === "admin") {
        actual[currentMonthIdx] = parseMoney(row[1]);
        budget[currentMonthIdx] = parseMoney(row[2]);
      }
    }

    const data = { actual, budget };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
