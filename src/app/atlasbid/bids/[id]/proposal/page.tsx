// src/app/atlasbid/bids/[id]/proposal/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type BidRow = {
  id: string;
  estimate_number?: string | number | null;
  bid_number?: string | number | null;
  client_name?: string | null;
  client_last_name?: string | null;
  customer_name?: string | null;
  address?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  created_at?: string | null;
  sell_rounded?: number | null;
  sell_price?: number | null;
  total?: number | null;
  amount?: number | null;
  prepay_enabled?: boolean | null;
  prepay_price?: number | null;
};

type LaborRow = {
  id: string;
  task: string;
  item?: string | null;
  details?: string | null;
  quantity?: number | null;
  unit?: string | null;
  man_hours?: number | null;
  hourly_rate?: number | null;
  show_as_line_item?: boolean | null;
  bundle_run_id?: string | null;
};
type BundleRunMeta = {
  id: string;
  bundle_id: string;
  bundle_name: string;
};

type ProposalRowBase = {
  label: string;
  cost: number;
};

type ProposalRow = {
  label: string;
  cost: number;
  amount: number;
};
function cleanText(value?: string | null) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}
function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function moneyDisplay(value: number) {
  const rounded = Math.round(value);
  return `$${rounded.toLocaleString()}.00`;
}

function unwrapBid(json: any): BidRow | null {
  return json?.data ?? json?.row ?? json ?? null;
}

function unwrapRows(json: any): LaborRow[] {
  const rows = json?.data ?? json?.rows ?? json ?? [];
  return Array.isArray(rows) ? rows : [];
}

async function safeJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json();
}

function laborRowCost(row: LaborRow) {
  return (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
}

function laborRowLabel(row: LaborRow) {
  const task = row.task || "";
  const details = row.details?.trim() || "";
  const qty = Number(row.quantity) || 0;
  const unit = row.unit || "";

  let label = task;

  if (details) {
    label += ` (${details})`;
  }

  if (qty > 0) {
    label += ` — ${qty} ${unit}`;
  }

  return label.trim();
}

function allocateSellAmounts(
  rows: ProposalRowBase[],
  totalSell: number
): ProposalRow[] {
  if (rows.length === 0) return [];

  const roundedTotalSell = Math.round(totalSell);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);

  if (roundedTotalSell <= 0) {
    return rows.map((row) => ({
      ...row,
      amount: 0,
    }));
  }

  if (totalCost <= 0) {
    const equalBase = Math.floor(roundedTotalSell / rows.length);
    let running = 0;

    return rows.map((row, idx) => {
      const amount =
        idx === rows.length - 1 ? roundedTotalSell - running : equalBase;

      running += amount;

      return {
        ...row,
        amount,
      };
    });
  }

  let allocatedRunning = 0;

  return rows.map((row, idx) => {
    if (idx === rows.length - 1) {
      return {
        ...row,
        amount: roundedTotalSell - allocatedRunning,
      };
    }

    const rawAmount = (row.cost / totalCost) * roundedTotalSell;
    const amount = Math.round(rawAmount);
    allocatedRunning += amount;

    return {
      ...row,
      amount,
    };
  });
}

export default function ProposalPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

 const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [bid, setBid] = useState<BidRow | null>(null);
const [labor, setLabor] = useState<LaborRow[]>([]);
const [bundleRunsMeta, setBundleRunsMeta] = useState<BundleRunMeta[]>([]);

  useEffect(() => {
    if (!bidId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const bidRes = await fetch(`/api/bids/${bidId}`, {
          cache: "no-store",
        });

        const bidJson = await safeJson(bidRes);

        if (!bidRes.ok) {
          throw new Error(
            bidJson?.error?.message || bidJson?.error || "Failed to load bid."
          );
        }

        if (!cancelled) {
          setBid(unwrapBid(bidJson));
        }

        try {
          const laborRes = await fetch(
            `/api/atlasbid/bid-labor?bid_id=${bidId}`,
            {
              cache: "no-store",
            }
          );

          const laborJson = await safeJson(laborRes);

          if (laborRes.ok && laborJson) {
            if (!cancelled) {
              setLabor(unwrapRows(laborJson));
            }
            const brRes = await fetch(`/api/atlasbid/bundle-runs?bid_id=${bidId}`, {
  cache: "no-store",
});
const brJson = await safeJson(brRes);
if (!cancelled) {
  setBundleRunsMeta(Array.isArray(brJson?.rows) ? brJson.rows : []);
}
          } else {
            if (!cancelled) {
              setLabor([]);
            }
          }
        } catch {
          if (!cancelled) {
            setLabor([]);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load proposal data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [bidId]);

 const clientFullName = useMemo(() => {
  const company = cleanText(bid?.customer_name);
  if (company) return company;

  const pieces = [
    cleanText(bid?.client_name),
    cleanText(bid?.client_last_name),
  ].filter(Boolean);

  return pieces.join(" ") || "Client Name";
}, [bid]);

const addressLine1 = useMemo(() => {
  return cleanText(bid?.address1 || bid?.address);
}, [bid]);


const addressLine2 = useMemo(() => {
  const addr2 = cleanText(bid?.address2);
  if (addr2) return addr2;

  const city = cleanText(bid?.city);
  const state = cleanText(bid?.state);
  const zip = cleanText(bid?.zip);

  const cityState = [city, state].filter(Boolean).join(", ");
  return `${cityState}${zip ? ` ${zip}` : ""}`.trim();
}, [bid]);

  const estimateNumber = useMemo(() => {
    return String(
      bid?.estimate_number ?? bid?.bid_number ?? bidId.slice(0, 6)
    );
  }, [bid, bidId]);

  const dateText = useMemo(() => {
    return formatDate(bid?.created_at) || formatDate(new Date().toISOString());
  }, [bid]);

  const amountValue = useMemo(() => {
    return Number(
      bid?.sell_rounded ?? bid?.sell_price ?? bid?.total ?? bid?.amount ?? 0
    );
  }, [bid]);

  const totalDisplayValue = useMemo(() => {
    if (bid?.prepay_enabled && Number(bid?.prepay_price ?? 0) > 0) {
      return Number(bid.prepay_price ?? 0);
    }
    return amountValue;
  }, [bid, amountValue]);

const bundleRunNameMap = useMemo(() => {
  return new Map(bundleRunsMeta.map((x) => [x.id, x.bundle_name]));
}, [bundleRunsMeta]);

const proposalRows = useMemo(() => {
  const baseRows: ProposalRowBase[] = [];
  const groupedBundleRunIds = new Set<string>();

  for (const row of labor) {
    const bundleRunId = row.bundle_run_id || null;
    const cost =
      (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);

    if (bundleRunId) {
      if (groupedBundleRunIds.has(bundleRunId)) continue;

      groupedBundleRunIds.add(bundleRunId);

      const bundleRows = labor.filter((r) => r.bundle_run_id === bundleRunId);

      const bundleCost = bundleRows.reduce(
        (sum, r) =>
          sum +
          (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0),
        0
      );

      baseRows.push({
        label: bundleRunNameMap.get(bundleRunId) || "Bundled Scope",
        cost: bundleCost,
      });

      continue;
    }

    const parts: string[] = [];
    if (row.task) parts.push(row.task);

    if ((Number(row.quantity) || 0) > 0 && row.unit) {
      parts.push(`${row.quantity} ${row.unit}`);
    }

    baseRows.push({
      label: parts.join(" — "),
      cost,
    });
  }

  return allocateSellAmounts(baseRows, totalDisplayValue);
}, [labor, bundleRunNameMap, totalDisplayValue]);
  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }
const projectTotal = Number(bid?.sell_rounded ?? totalDisplayValue ?? 0);

const prepayEnabled = Boolean(bid?.prepay_enabled);
const prepayPrice = prepayEnabled
  ? Number(bid?.prepay_price || 0)
  : 0;

const prepayDiscountPct =
  projectTotal > 0
    ? Math.round(((projectTotal - prepayPrice) / projectTotal) * 10000) / 100
    : 0;

const showPrepaySection =
  prepayEnabled && prepayPrice > 0 && prepayPrice < projectTotal;
  return (
    <div className="bg-white px-6 py-8">
      <div
        className="mx-auto bg-white text-black"
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: "0.55in 0.7in 0.55in 0.7in",
          boxSizing: "border-box",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="w-[270px] pt-2">
            <img
              src="/garpiel-logo.jpg"
              alt="Garpiel Group"
              className="w-[210px] h-auto"
            />
          </div>

          <div className="w-[220px] pt-3 text-right text-[13px] leading-[1.45]">
            <div>Garpiel Group</div>
            <div>3161 Carrollton Rd.</div>
            <div>Saginaw, MI 48604</div>
            <div>Phone: (989) 797 4749</div>
            <div>www.GarpielGroup.com</div>

            <div className="mt-4 inline-block bg-[#4b4b4b] px-3 py-[2px] text-[16px] font-bold tracking-[0.02em] text-white">
              LANDSCAPE ESTIMATE
            </div>
          </div>
        </div>

        <div className="mt-8 pl-[8px] text-[14px] leading-[1.55]">
          <div>{clientFullName}</div>
          {addressLine1 ? <div>{addressLine1}</div> : null}
          {addressLine2 ? <div>{addressLine2}</div> : null}
        </div>

        <div className="mt-8 grid grid-cols-3 text-[14px]">
          <div className="text-left">
            <span className="font-semibold">Estimate #:</span> {estimateNumber}
          </div>
          <div className="text-center">
            <span className="font-semibold">Project:</span> {clientFullName}
          </div>
          <div className="text-right">
            <span className="font-semibold">Date:</span> {dateText}
          </div>
        </div>

        <div className="mt-8 text-center text-[20px] font-semibold leading-tight text-[#4a4a4a]">
          Landscape Project - Estimate is valid for 30 days.
        </div>

        <div className="mt-1 text-center">
          <span className="bg-[#f4ecb8] px-1 text-[14px] italic text-[#5b5b5b]">
            A 50% down payment is due along with a signed contract to move
            forward with project.
          </span>
        </div>

        <div className="mt-7 border border-[#8f8f8f]">
          <div className="grid grid-cols-[1fr_150px] border-b border-[#8f8f8f]">
            <div className="border-r border-[#8f8f8f] px-4 py-2 text-[14px] font-semibold">
              Project Description
            </div>
            <div className="px-4 py-2 text-right text-[14px] font-semibold">
              Amount
            </div>
          </div>

          <div className="min-h-[360px]">
            {proposalRows.length === 0 ? (
              <div className="grid grid-cols-[1fr_150px]">
                <div className="border-r border-[#8f8f8f] px-4 py-3 text-[14px] leading-[1.55]">
                  Project scope will appear here.
                </div>
                <div className="px-4 py-3 text-right text-[14px]">
                  {moneyDisplay(0)}
                </div>
              </div>
            ) : (
              proposalRows.map((row, idx) => (
                <div
                  key={`${row.label}-${idx}`}
                  className="grid grid-cols-[1fr_150px] border-b border-[#8f8f8f]"
                >
                  <div className="border-r border-[#8f8f8f] px-4 py-3 text-[14px] leading-[1.55]">
                    - {row.label}
                  </div>
                  <div className="px-4 py-3 text-right text-[14px]">
                    {moneyDisplay(row.amount)}
                  </div>
                </div>
              ))
            )}
          </div>

       <div className="grid grid-cols-[1fr_150px] border-t border-[#8f8f8f]">
  <div className="border-r border-[#8f8f8f] px-4 py-3 text-right text-[14px] font-semibold">
    Project Total
  </div>
  <div className="px-4 py-3 text-right text-[14px] font-semibold">
    {moneyDisplay(projectTotal)}
  </div>
</div>

{showPrepaySection && (
  <>
    <div className="grid grid-cols-[1fr_150px] border-t border-[#8f8f8f]">
      <div className="border-r border-[#8f8f8f] px-4 py-3 text-right text-[14px] text-gray-600">
        Prepay Discount ({settings.prepay_discount_pct}%)
      </div>
      <div className="px-4 py-3 text-right text-[14px] text-gray-700">
        -{moneyDisplay(prepayDiscountAmount)}
      </div>
    </div>

    <div className="grid grid-cols-[1fr_150px] border-t border-[#8f8f8f]">
      <div className="border-r border-[#8f8f8f] px-4 py-3 text-right text-[14px] font-bold">
        Price with Prepay
      </div>
      <div className="px-4 py-3 text-right text-[14px] font-bold">
        {moneyDisplay(prepayPrice)}
      </div>
    </div>
  </>
)}
        </div>
      </div>

      <div className="break-before-page h-10" />

      <div
        className="mx-auto bg-white text-black"
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: "0.7in 0.7in 0.7in 0.7in",
          boxSizing: "border-box",
        }}
      >
        <h1 className="mb-6 text-[26px] font-bold">
          Garpiel Group Terms of Service
        </h1>

        <div className="space-y-4 text-[14px] leading-[1.55] text-[#3f3f3f]">
          <p>
            Terms and conditions will appear here exactly as they do on the
            current estimate document.
          </p>
          <p>
            This page is intentionally separated from page one and will be
            replaced with the exact fixed terms text from your current estimate.
          </p>
        </div>
      </div>
    </div>
  );
}
