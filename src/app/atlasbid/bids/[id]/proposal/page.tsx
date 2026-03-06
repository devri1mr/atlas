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
};

type LaborRow = {
  id: string;
  task: string;
  show_as_line_item?: boolean | null;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function moneyPlain(value: number) {
  return value.toFixed(2);
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

export default function ProposalPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bid, setBid] = useState<BidRow | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);

  useEffect(() => {
    if (!bidId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // Load bid
        const bidRes = await fetch(`/api/atlasbid/bids/${bidId}`, {
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

        // Try to load labor rows.
        // If this endpoint is not your actual GET route, we fail gracefully.
        try {
          const laborRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, {
            cache: "no-store",
          });

          const laborJson = await safeJson(laborRes);

          if (laborRes.ok && laborJson) {
            if (!cancelled) {
              setLabor(unwrapRows(laborJson));
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
    const pieces = [
      bid?.customer_name,
      bid?.client_name,
      bid?.client_last_name,
    ].filter(Boolean);
    return pieces.join(" ") || "Client Name";
  }, [bid]);

  const addressLine1 = useMemo(() => {
    return bid?.address || bid?.address1 || "";
  }, [bid]);

  const addressLine2 = useMemo(() => {
    if (bid?.address2) return bid.address2;

    const cityStateZip = [
      bid?.city,
      bid?.state,
      bid?.zip,
    ].filter(Boolean);

    return cityStateZip.join(" ") || "";
  }, [bid]);

  const estimateNumber = useMemo(() => {
    return String(
      bid?.estimate_number ??
        bid?.bid_number ??
        bidId.slice(0, 6)
    );
  }, [bid, bidId]);

  const dateText = useMemo(() => {
    return formatDate(bid?.created_at) || formatDate(new Date().toISOString());
  }, [bid]);

  const amountValue = useMemo(() => {
    return Number(
      bid?.sell_rounded ??
        bid?.sell_price ??
        bid?.total ??
        bid?.amount ??
        0
    );
  }, [bid]);

  const scopeLines = useMemo(() => {
    const lineItems = labor.filter((l) => !!l.show_as_line_item);
    const bundled = labor.filter((l) => !l.show_as_line_item);

    const lines: string[] = [];

    if (bundled.length > 0) {
      lines.push(bundled.map((l) => l.task).join(", "));
    }

    if (lineItems.length > 0) {
      lines.push(...lineItems.map((l) => l.task));
    }

    return lines.length > 0 ? lines : ["Project scope will appear here."];
  }, [labor]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  return (
    <div className="bg-white px-6 py-8">
      {/* PAGE 1 */}
      <div
        className="mx-auto bg-white text-black"
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: "0.55in 0.7in 0.55in 0.7in",
          boxSizing: "border-box",
        }}
      >
        {/* Top header */}
        <div className="flex items-start justify-between">
          {/* Left logo */}
          <div className="w-[270px] pt-2">
            <img
              src="/garpiel-logo.jpg"
              alt="Garpiel Group"
              className="w-[210px] h-auto"
            />
          </div>

          {/* Right company info */}
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

        {/* Customer block */}
        <div className="mt-8 pl-[8px] text-[14px] leading-[1.55]">
          <div>{clientFullName}</div>
          {addressLine1 ? <div>{addressLine1}</div> : null}
          {addressLine2 ? <div>{addressLine2}</div> : null}
        </div>

        {/* Estimate / Project / Date row */}
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

        {/* Validity */}
        <div className="mt-8 text-center text-[20px] font-semibold leading-tight text-[#4a4a4a]">
          Landscape Project - Estimate is valid for 30 days.
        </div>

        {/* Deposit */}
        <div className="mt-1 text-center">
          <span className="bg-[#f4ecb8] px-1 text-[14px] italic text-[#5b5b5b]">
            A 50% down payment is due along with a signed contract to move forward
            with project.
          </span>
        </div>

        {/* Description / Amount table */}
        <div className="mt-7 border border-[#8f8f8f]">
          <div className="grid grid-cols-[1fr_150px] border-b border-[#8f8f8f]">
            <div className="border-r border-[#8f8f8f] px-4 py-2 text-[14px] font-semibold">
              Project Description
            </div>
            <div className="px-4 py-2 text-right text-[14px] font-semibold">
              Amount
            </div>
          </div>

          <div className="grid grid-cols-[1fr_150px]">
            <div className="min-h-[360px] border-r border-[#8f8f8f] px-4 py-3 text-[14px] leading-[1.55]">
              {scopeLines.map((line, idx) => (
                <div key={`${line}-${idx}`}>- {line}</div>
              ))}
            </div>

            <div className="px-4 py-3 text-right text-[14px]">
              {moneyPlain(amountValue)}
            </div>
          </div>
        </div>
      </div>

      {/* PAGE BREAK */}
      <div className="break-before-page h-10" />

      {/* PAGE 2 */}
      <div
        className="mx-auto bg-white text-black"
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: "0.7in 0.7in 0.7in 0.7in",
          boxSizing: "border-box",
        }}
      >
        <h1 className="mb-6 text-[26px] font-bold">Garpiel Group Terms of Service</h1>

        <div className="space-y-4 text-[14px] leading-[1.55] text-[#3f3f3f]">
          <p>
            Terms and conditions will appear here exactly as they do on the current
            estimate document.
          </p>
          <p>
            This page is intentionally separated from page one and will be replaced
            with the exact fixed terms text from your current estimate.
          </p>
        </div>
      </div>
    </div>
  );
}
