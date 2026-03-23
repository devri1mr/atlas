"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  proposal_text?: string | null;
  item?: string | null;
  details?: string | null;
  quantity?: number | null;
  unit?: string | null;
  man_hours?: number | null;
  hourly_rate?: number | null;
  show_as_line_item?: boolean | null;
  hidden_from_proposal?: boolean | null;
  bundle_run_id?: string | null;
  proposal_section?: string | null;
};

type BundleRunMeta = {
  id: string;
  bundle_id: string;
  bundle_name: string;
};

type ProposalRowBase = {
  label: string;
  cost: number;
  children?: string[];
};

type ProposalRow = {
  label: string;
  cost: number;
  amount: number;
  children?: string[];
};

function cleanText(value?: string | null) {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";
  return s;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function moneyDisplay(value: number) {
  const rounded = Math.round(Number(value) || 0);
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

function allocateSellAmounts(rows: ProposalRowBase[], totalSell: number): ProposalRow[] {
  if (rows.length === 0) return [];
  const roundedTotalSell = Math.round(Number(totalSell) || 0);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);

  if (roundedTotalSell <= 0) return rows.map(row => ({ ...row, amount: 0 }));

  if (totalCost <= 0) {
    const equalBase = Math.floor(roundedTotalSell / rows.length);
    let running = 0;
    return rows.map((row, idx) => {
      const amount = idx === rows.length - 1 ? roundedTotalSell - running : equalBase;
      running += amount;
      return { ...row, amount };
    });
  }

  let allocatedRunning = 0;
  return rows.map((row, idx) => {
    if (idx === rows.length - 1) return { ...row, amount: roundedTotalSell - allocatedRunning };
    const amount = Math.round((row.cost / totalCost) * roundedTotalSell);
    allocatedRunning += amount;
    return { ...row, amount };
  });
}

// ── Terms paragraphs (exact from PDF) ──────────────────────────────────────
const TERMS = [
  {
    title: "General",
    body: "Garpiel Group will have any buried utilities marked prior to the project being started via Miss Dig. Garpiel Group is not responsible for any damages to underground sprinkler lines or private utilities (i,e. invisible pet fences, landscape lighting, underground downspouts, etc).",
  },
  {
    title: "Payment",
    body: "50% of total project cost will be due before a project start date is scheduled. The remaining (50%) and any additional cost will be due upon receipt of invoice within 7 days. Client agrees to pay a late fee of 1.5% per month on any unpaid balance. Payment can be made by either check or credit card. A maximum of $5,000 will be accepted by credit card payment per project. Should Garpiel Group be forced to institute collections proceedings against Client for any unpaid balance, Client agrees to pay Garpiel Group's reasonable costs and attorney fees.",
  },
  {
    title: "Plant Warranty",
    body: "Any NEW plant (excludes transplants) installed by Garpiel Group carries a one-year warranty from the date of planting. Garpiel Group reserves the right to determine if the plant warrants replacement. A plant under warranty will only be replaced once. Garpiel Group will cover the cost of the plant & the property owner will incur a $55.00/hour labor rate for replacement of plants. Warranty does not cover any annuals, perennials, roses, tropical plants, or ornamental grasses. In addition it does not cover damage or death from invasive/exotic pests, snow plow damage, winter damage, fire, vandalism, and/or natural causes beyond Garpiel Group's control. The homeowner is responsible for all watering after plantings to ensure newly planted plant material receives adequate water. Watering service can be provided by Garpiel Group for additional cost. All warranty replacements will take place between April 15th - May 30th and September 1st - November 15th. If a plant health care fertilization package is purchased through Garpiel Group all plants will be warrantied for two years from the date of original planting.",
  },
  {
    title: "Paver/Retaining Wall Warranty",
    body: "Garpiel Group will warranty workmanship along with any Unilock brand brick for two years from the date of installation. Garpiel Group will not warranty damages due to the homeowner, snow plow damage, fire, vandalism, and/or natural causes beyond our control.",
  },
  {
    title: "Irrigation Warranty",
    body: "Garpiel Group warrants all parts for a period of one (1) year and workmanship for a period of two (2) years from the date of installation, provided that the system is maintained exclusively by Garpiel Group during this period. This warranty does not cover freeze damage if the system has not been properly winterized by Garpiel Group.",
  },
  {
    title: "Notice Regarding Warranty",
    body: "Any notice given by Client pursuant to a warranty provision in this Contract shall be given to Garpiel Group in writing via certified mail, postage fully prepaid. Further, Garpiel Group specifically disclaims any and all other warranties and all implied warranties (either in fact or by operation of law) including, but not limited to, any implied warranties of merchantability and fitness for a particular purpose or any implied warranty arising out of a course of dealing, custom, or usage of trade.",
  },
  {
    title: "Additional Work Request",
    body: "Garpiel Group shall perform only the services explicitly specified in this Contract. If Client would like to add any additional work that is not listed on this estimate, Client must contact their salesman prior to the beginning of project start date. No additional work will be completed without a new signed contract.",
  },
  {
    title: "Limitation of Liability",
    body: "Garpiel Group shall be free from any liabilities (including structural or accidental) when using machinery, except for accidents caused by improper use. In no event shall Garpiel Group, its members, managers, employees, agents, or affiliates be responsible for indirect, special, nominal, incidental, punitive, or consequential losses or damages, or for any penalties, regardless of the legal or equitable theory asserted, including contract, negligence, warranty, strict liability, statute or otherwise, even if it had been aware of the possibility of such damages or they are foreseeable; or for claims by a third party. The maximum aggregate liability shall not exceed three times the amount paid by customer for the services or actual proven damages, whichever is less. It is expressly agreed that Client's remedy expressed herein is Client's exclusive remedy. The limitations set forth herein shall apply even if any other remedies fail of their essential purpose.",
  },
  {
    title: "Delay/Disruption",
    body: "Garpiel Group undertakes to use all reasonable endeavors to complete the work within a reasonable time or by a specific date if agreed. Under no circumstances shall Garpiel Group incur any liability to Client for any untimely performance. Further, Garpiel Group shall not be held responsible for any delays caused by weather which make contract execution impossible.",
  },
  {
    title: "Natural Occurrence",
    body: "Garpiel Group is not responsible for natural occurrences or acts of God such as cracks, splits, or spalls on any natural limestone, or effects of mother nature.",
  },
  {
    title: "Jurisdiction and Venue",
    body: "This Contract shall be interpreted under the laws of the State of Michigan, and client agrees that any action at law or in equity arising out of, or relating to, this Contract must be filed and adjudicated only in the state courts located in Saginaw County, Michigan, or in the federal district court for the Eastern District of Michigan located in Bay City, Michigan. Client consents and submits to the personal and exclusive jurisdiction of such courts.",
  },
  {
    title: "Maintenance After Completion",
    body: "Garpiel Group agrees to perform the scope of work outlined in this Contract. Upon completion of the work, responsibility for the proper maintenance of the site shall transfer to the Client, unless otherwise agreed to in writing by both parties. The determination of the completion of this Contract shall be at the sole discretion of Garpiel Group.",
  },
  {
    title: "Fuel Surcharge",
    body: "In the event gas prices rise over $4.00 per gallon Garpiel Group may add a reasonable temporary surcharge to reflect increased fuel costs. The fuel surcharge will be calculated on a monthly basis.",
  },
  {
    title: "Cancellation",
    body: "In the event that the client cancels the service, Garpiel shall be entitled to recovery of costs, fees and administrative expenses incurred, whether or not yet paid, in furtherance of the engagement on behalf of the client. Those costs and expenses shall be deducted from the deposit provided by the client in an amount of actual costs incurred or ten (10%) percent of the deposit, whichever is greater. Any costs and expenses incurred in excess of the deposit shall be billed to the client with payment due as provided in this Agreement subject to a late fee of one and one-half (1.5%) percent per month on any unpaid balance.",
  },
  {
    title: "Severability",
    body: "The provisions of this Contract are fully severable.",
  },
];

// ── Component ───────────────────────────────────────────────────────────────
export default function ProposalPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bid, setBid] = useState<BidRow | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [bundleRunsMeta, setBundleRunsMeta] = useState<BundleRunMeta[]>([]);

  // Document scaling
  const wrapperRef = useRef<HTMLDivElement>(null);
  const docRef     = useRef<HTMLDivElement>(null);
  const termsRef   = useRef<HTMLDivElement>(null);
  const [scale, setScale]       = useState(1);
  const [p1Height, setP1Height] = useState(0);
  const [termsHeight, setTermsHeight] = useState(0);
  const DOC_WIDTH = 816;

  useEffect(() => {
    function measure() {
      if (!wrapperRef.current) return;
      const w = wrapperRef.current.clientWidth;
      const s = w < DOC_WIDTH ? w / DOC_WIDTH : 1;
      setScale(s);
      if (docRef.current)   setP1Height(docRef.current.scrollHeight);
      if (termsRef.current) setTermsHeight(termsRef.current.scrollHeight);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [loading]);

  // Email modal state
  const [showEmail, setShowEmail] = useState(false);
  const [copied, setCopied]       = useState(false);

  // Signature state
  const [sigMode, setSigMode]       = useState<"draw" | "type">("draw");
  const [typedName, setTypedName]   = useState("");
  const [agreed, setAgreed]         = useState(false);
  const [sigHasContent, setSigHasContent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing   = useRef(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bidId) return;
    let cancelled = false;

    async function load() {
      setLoading(true); setError("");
      try {
        const bidRes  = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
        const bidJson = await safeJson(bidRes);
        if (!bidRes.ok) throw new Error(bidJson?.error?.message || bidJson?.error || "Failed to load bid.");
        if (!cancelled) setBid(unwrapBid(bidJson));

        try {
          const laborRes  = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" });
          const laborJson = await safeJson(laborRes);
          if (laborRes.ok && laborJson) {
            if (!cancelled) setLabor(unwrapRows(laborJson));
            const brRes  = await fetch(`/api/atlasbid/bundle-runs?bid_id=${bidId}`, { cache: "no-store" });
            const brJson = await safeJson(brRes);
            if (!cancelled) setBundleRunsMeta(Array.isArray(brJson?.rows) ? brJson.rows : []);
          } else {
            if (!cancelled) setLabor([]);
          }
        } catch { if (!cancelled) setLabor([]); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load proposal data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bidId]);

  // ── Derived values ────────────────────────────────────────────────────────
  const clientFullName = useMemo(() => {
    const company = cleanText(bid?.customer_name);
    if (company) return company;
    return [cleanText(bid?.client_name), cleanText(bid?.client_last_name)].filter(Boolean).join(" ") || "Client Name";
  }, [bid]);

  const addressLine1 = useMemo(() => cleanText(bid?.address1 || bid?.address), [bid]);
  const addressLine2 = useMemo(() => {
    const addr2 = cleanText(bid?.address2);
    if (addr2) return addr2;
    const city = cleanText(bid?.city), state = cleanText(bid?.state), zip = cleanText(bid?.zip);
    return `${[city, state].filter(Boolean).join(", ")}${zip ? ` ${zip}` : ""}`.trim();
  }, [bid]);

  const estimateNumber = useMemo(() => String(bid?.estimate_number ?? bid?.bid_number ?? bidId.slice(0, 6)), [bid, bidId]);
  const dateText       = useMemo(() => formatDate(bid?.created_at) || formatDate(new Date().toISOString()), [bid]);
  const amountValue    = useMemo(() => Number(bid?.sell_rounded ?? bid?.sell_price ?? bid?.total ?? bid?.amount ?? 0), [bid]);
  const totalDisplayValue = useMemo(() => {
    if (bid?.prepay_enabled && Number(bid?.prepay_price ?? 0) > 0) return Number(bid.prepay_price ?? 0);
    return amountValue;
  }, [bid, amountValue]);

  const bundleRunNameMap = useMemo(() => new Map(bundleRunsMeta.map(x => [x.id, x.bundle_name])), [bundleRunsMeta]);

  const proposalRows = useMemo(() => {
    const baseRows: ProposalRowBase[] = [];
    const groupedBundleRunIds = new Set<string>();
    const groupedSections = new Set<string>();

    for (const row of labor) {
      if (row.hidden_from_proposal) continue;
      const bundleRunId = row.bundle_run_id || null;
      const section = row.proposal_section?.trim() || null;
      const cost = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);

      if (bundleRunId && row.show_as_line_item !== true) {
        if (groupedBundleRunIds.has(bundleRunId)) continue;
        groupedBundleRunIds.add(bundleRunId);
        const bundleRows = labor.filter(r => r.bundle_run_id === bundleRunId && r.show_as_line_item !== true && !r.hidden_from_proposal);
        if (bundleRows.length === 0) continue;
        const bundleCost = bundleRows.reduce((sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0);
        const childLines = bundleRows.map(r => cleanText(r.proposal_text) || cleanText(r.task)).filter(Boolean);
        baseRows.push({ label: `BUNDLE:${bundleRunNameMap.get(bundleRunId) || "Bundled Scope"}`, cost: bundleCost, children: childLines } as any);
        continue;
      }

      if (section && !bundleRunId) {
        if (groupedSections.has(section)) continue;
        groupedSections.add(section);
        const sectionRows = labor.filter(r => !r.hidden_from_proposal && !r.bundle_run_id && r.proposal_section?.trim() === section);
        const sectionCost = sectionRows.reduce((sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0);
        const childLines = sectionRows.map(r => cleanText(r.proposal_text) || cleanText(r.task)).filter(Boolean);
        baseRows.push({ label: `SECTION:${section}`, cost: sectionCost, children: childLines } as any);
        continue;
      }

      const parts: string[] = [];
      const taskText = cleanText(row.proposal_text) || cleanText(row.task);
      if (taskText) parts.push(taskText);
      if ((Number(row.quantity) || 0) > 0 && row.unit) parts.push(`${row.quantity} ${row.unit}`);
      baseRows.push({ label: parts.join(" — "), cost } as any);
    }

    return allocateSellAmounts(baseRows, totalDisplayValue);
  }, [labor, bundleRunNameMap, totalDisplayValue]);

  // ── Signature canvas handlers ─────────────────────────────────────────────
  function getSigPt(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = sigCanvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top)  * (canvas.height / r.height),
    };
  }

  function onSigDown(e: React.PointerEvent<HTMLCanvasElement>) {
    sigCanvasRef.current!.setPointerCapture(e.pointerId);
    sigDrawing.current = true;
    const { x, y } = getSigPt(e);
    const ctx = sigCanvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onSigMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!sigDrawing.current) return;
    const { x, y } = getSigPt(e);
    const ctx = sigCanvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setSigHasContent(true);
  }

  function onSigUp() { sigDrawing.current = false; }

  function clearSig() {
    const canvas = sigCanvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setSigHasContent(false);
  }

  // ── Submit acceptance ─────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!agreed) return;
    const hasSignature = sigMode === "draw" ? sigHasContent : typedName.trim().length > 0;
    if (!hasSignature) return;

    setSubmitting(true); setSubmitError("");
    try {
      const signatureData = sigMode === "draw"
        ? sigCanvasRef.current!.toDataURL("image/png")
        : typedName.trim();

      const res = await fetch("/api/atlasbid/bid-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bid_id: bidId,
          signature_type: sigMode,
          signature_data: signatureData,
          signer_name: sigMode === "type" ? typedName.trim() : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Submission failed.");
      setSubmitSuccess(true);
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Early returns ─────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-sm text-gray-500">Loading proposal…</div>;
  if (error)   return <div className="p-8 text-red-600 text-sm">{error}</div>;

  const projectTotal     = proposalRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const prepayEnabled    = Boolean(bid?.prepay_enabled);
  const prepayPrice      = prepayEnabled ? Number(bid?.prepay_price || 0) : 0;
  const prepayDiscountPct    = projectTotal > 0 ? Math.round(((projectTotal - prepayPrice) / projectTotal) * 100) : 0;
  const prepayDiscountAmount = Math.max(0, Math.round((projectTotal - prepayPrice) * 100) / 100);
  const showPrepaySection    = prepayEnabled && prepayPrice > 0 && prepayPrice < projectTotal;

  const docStyle = {
    width: DOC_WIDTH,
    boxSizing: "border-box" as const,
    transformOrigin: "top left",
    transform: scale < 1 ? `scale(${scale})` : undefined,
  };

  const canAccept = agreed && (sigMode === "draw" ? sigHasContent : typedName.trim().length > 0);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="bg-white overflow-x-hidden">

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .doc-wrapper { height: auto !important; overflow: visible !important; padding: 0 !important; }
          .doc-scaled { transform: none !important; width: 100% !important; margin: 0 !important; }
          .print-page-break { break-before: page; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Action bar (hidden on print) ── */}
      <div className="no-print sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-600 truncate">
          Proposal — {clientFullName}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowEmail(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Email
          </button>
          <button
            onClick={() => window.open(`/print/proposal/${bidId}`, "_blank")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#123b1f] text-white text-sm font-semibold hover:bg-[#0d2616] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* ── Email modal ── */}
      {showEmail && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowEmail(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Send Proposal to Client</h3>
              <button onClick={() => setShowEmail(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-3">
              Share this link with <strong className="text-gray-700">{clientFullName}</strong> so they can review and sign online.
            </p>

            {/* Link copy */}
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
              <span className="text-xs text-gray-500 truncate flex-1 font-mono">{typeof window !== "undefined" ? window.location.href : ""}</span>
              <button
                onClick={copyLink}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#123b1f] text-white hover:bg-[#0d2616] transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <a
              href={`mailto:?subject=Your Proposal from Garpiel Group&body=Please review your landscape proposal and sign online:%0A%0A${typeof window !== "undefined" ? encodeURIComponent(window.location.href) : ""}`}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[#123b1f] text-[#123b1f] font-semibold text-sm hover:bg-[#f0f4f0] transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              Open in Email App
            </a>

            <p className="mt-3 text-xs text-gray-400 text-center">
              The client will be able to read the terms and sign digitally from any device.
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 1 — PROPOSAL SCOPE
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="doc-wrapper overflow-hidden py-4 sm:py-8"
        style={{ height: scale < 1 && p1Height ? p1Height * scale + 32 : undefined }}
      >
        <div
          ref={docRef}
          className="doc-scaled mx-auto bg-white text-black"
          style={{ ...docStyle, minHeight: "11in", padding: "0.55in 0.7in 0.55in 0.7in" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="w-[270px] pt-2">
              <img src="/garpiel-logo.jpg" alt="Garpiel Group" className="w-[210px] h-auto" />
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

          {/* Client address */}
          <div className="mt-8 pl-[8px] text-[14px] leading-[1.55]">
            <div>{clientFullName}</div>
            {addressLine1 && <div>{addressLine1}</div>}
            {addressLine2 && <div>{addressLine2}</div>}
          </div>

          {/* Estimate meta row */}
          <div className="mt-8 grid grid-cols-3 text-[14px]">
            <div className="text-left"><span className="font-semibold">Estimate #:</span> {estimateNumber}</div>
            <div className="text-center"><span className="font-semibold">Project:</span> {clientFullName}</div>
            <div className="text-right"><span className="font-semibold">Date:</span> {dateText}</div>
          </div>

          {/* Title */}
          <div className="mt-8 text-center text-[20px] font-semibold leading-tight text-[#4a4a4a]">
            Landscape Project - Estimate is valid for 30 days.
          </div>
          <div className="mt-1 text-center">
            <span className="bg-[#f4ecb8] px-1 text-[14px] italic text-[#5b5b5b]">
              A 50% down payment is due along with a signed contract to move forward with project.
            </span>
          </div>

          {/* Scope table */}
          <div className="mt-7 border border-[#8f8f8f]">
            <div className="grid grid-cols-[1fr_150px] border-b border-[#8f8f8f]">
              <div className="border-r border-[#8f8f8f] px-4 py-2 text-[14px] font-semibold">Project Description</div>
              <div className="px-4 py-2 text-right text-[14px] font-semibold">Amount</div>
            </div>

            <div className="min-h-[360px]">
              {proposalRows.length === 0 ? (
                <div className="grid grid-cols-[1fr_150px]">
                  <div className="border-r border-[#8f8f8f] px-4 py-3 text-[14px] leading-[1.55]">Project scope will appear here.</div>
                  <div className="px-4 py-3 text-right text-[14px]">{moneyDisplay(0)}</div>
                </div>
              ) : (
                proposalRows.map((row, idx) => {
                  const label = String(row.label || "");
                  const isBundle  = label.startsWith("BUNDLE:");
                  const isSection = label.startsWith("SECTION:");
                  const isGrouped = isBundle || isSection;
                  const groupName = isBundle ? label.slice(7) : isSection ? label.slice(8) : label;
                  const children: string[] = row.children ?? [];
                  return (
                    <div key={`${row.label}-${idx}`} className="grid grid-cols-[1fr_150px] border-b border-[#8f8f8f]">
                      <div className="border-r border-[#8f8f8f] px-4 py-3 text-[14px] leading-[1.55]">
                        {isGrouped ? (
                          <>
                            <div style={{ fontWeight: 600, marginBottom: children.length ? 4 : 0 }}>{groupName}</div>
                            {children.map((c, i) => <div key={i} style={{ paddingLeft: 16, color: "#444" }}>— {c}</div>)}
                          </>
                        ) : (
                          <div>{label}</div>
                        )}
                      </div>
                      <div className="px-4 py-3 text-right text-[14px]">{moneyDisplay(row.amount)}</div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="grid grid-cols-[1fr_150px] border-t border-[#8f8f8f]">
              <div className="border-r border-[#8f8f8f] px-4 py-3 text-right text-[14px] font-semibold">Project Total</div>
              <div className="px-4 py-3 text-right text-[14px] font-semibold">{moneyDisplay(projectTotal)}</div>
            </div>

            {showPrepaySection && (
              <>
                <div className="grid grid-cols-[1fr_150px] border-t border-[#8f8f8f]">
                  <div className="border-r border-[#8f8f8f] px-4 py-3 text-right text-[14px] text-gray-600">Prepay Discount ({prepayDiscountPct}%)</div>
                  <div className="px-4 py-3 text-right text-[14px] text-gray-700">-{moneyDisplay(prepayDiscountAmount)}</div>
                </div>
                <div className="grid grid-cols-[1fr_150px] border-t border-[#8f8f8f]">
                  <div className="border-r border-[#8f8f8f] px-4 py-3 text-right text-[14px] font-bold">Price with Prepay</div>
                  <div className="px-4 py-3 text-right text-[14px] font-bold">{moneyDisplay(prepayPrice)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 2 — TERMS OF SERVICE
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="h-3 bg-gray-100 no-print" />
      <div
        className="doc-wrapper print-page-break overflow-hidden"
        style={{ height: scale < 1 && termsHeight ? termsHeight * scale + 32 : undefined }}
      >
        <div
          ref={termsRef}
          className="doc-scaled mx-auto bg-white text-black"
          style={{ ...docStyle, padding: "0.7in 0.7in 0.8in 0.7in" }}
        >
          {/* Title — centered, bold, matching PDF */}
          <h1 className="mb-6 text-center text-[22px] font-bold tracking-tight">
            Garpiel Group Terms of Service
          </h1>

          {/* Term paragraphs */}
          <div className="space-y-[10px] text-[13.5px] leading-[1.58] text-[#1a1a1a]">
            {TERMS.map(({ title, body }) => (
              <p key={title}>
                <strong>{title}:</strong> {body}
              </p>
            ))}
          </div>

          {/* ALL WARRANTIES notice */}
          <p className="mt-6 text-center text-[13.5px] font-bold">
            ** ALL WARRANTIES ARE VOID IF CLIENT&apos;S ACCOUNT IS NOT IN GOOD STANDING**
          </p>

          {/* Acceptance paragraph */}
          <p className="mt-6 text-[13.5px] leading-[1.58]">
            <strong>Acceptance of Proposal:</strong> The price, specifications and conditions are satisfactory and are hereby accepted. Garpiel Group is authorized to do the work, as specified. Payment will be made, as outlined above.
          </p>

          {/* Printed signature line */}
          <div className="mt-14 mx-auto w-80 border-b border-[#1a1a1a]" />
          <p className="mt-2 text-center text-[13.5px]">Signature</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DIGITAL ACCEPTANCE — RESPONSIVE, NOT SCALED
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="no-print bg-[#f0f4f0] border-t-4 border-[#16a34a]">
        <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">

          {submitSuccess ? (
            /* ── Success ── */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-[#16a34a] flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Proposal Accepted</h2>
              <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
                Your acceptance has been recorded. A member of the Garpiel Group team will be in touch shortly to schedule your project start date and collect the 50% deposit.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 bg-white rounded-xl px-5 py-3 border border-gray-200 shadow-sm text-sm text-gray-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                (989) 797-4749
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">Accept & Sign Proposal</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Review the Terms of Service above, then sign below to authorize the work.
                </p>
              </div>

              {/* Mode tabs */}
              <div className="flex rounded-xl bg-white border border-gray-200 p-1 gap-1 mb-5">
                {(["draw", "type"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => { setSigMode(mode); setSigHasContent(false); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      sigMode === mode
                        ? "bg-[#16a34a] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {mode === "draw" ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Draw Signature
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17 6H3"/><path d="M21 12H3"/><path d="M21 18H3"/></svg>
                        Type Name
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Draw mode */}
              {sigMode === "draw" && (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-white">
                    <canvas
                      ref={sigCanvasRef}
                      width={760}
                      height={200}
                      className="w-full touch-none block"
                      style={{ cursor: "crosshair" }}
                      onPointerDown={onSigDown}
                      onPointerMove={onSigMove}
                      onPointerUp={onSigUp}
                      onPointerLeave={onSigUp}
                    />
                    {!sigHasContent && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-gray-300 text-sm select-none">Sign here with your finger or mouse</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={clearSig}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.18"/></svg>
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Type mode */}
              {sigMode === "type" && (
                <div className="space-y-2">
                  <div className="relative bg-white rounded-xl border-2 border-dashed border-gray-300 px-5 py-4">
                    <input
                      value={typedName}
                      onChange={e => setTypedName(e.target.value)}
                      placeholder="Type your full legal name"
                      className="w-full text-[26px] text-gray-900 placeholder-gray-200 outline-none bg-transparent"
                      style={{ fontFamily: "'Georgia', serif", fontStyle: "italic" }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    By typing your name, you agree this constitutes your legal electronic signature.
                  </p>
                </div>
              )}

              {/* Agreement checkbox */}
              <label className="flex items-start gap-3 mt-6 cursor-pointer group">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded border-2 border-gray-300 peer-checked:border-[#16a34a] peer-checked:bg-[#16a34a] transition-colors flex items-center justify-center">
                    {agreed && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-600 leading-relaxed">
                  I have read and agree to the <strong className="text-gray-800">Garpiel Group Terms of Service</strong> above. I authorize Garpiel Group to proceed with the specified work. I understand that a <strong className="text-gray-800">50% deposit is due</strong> before a start date is scheduled.
                </span>
              </label>

              {/* Error */}
              {submitError && (
                <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={!canAccept || submitting}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-base py-4 rounded-xl transition-colors shadow-sm"
              >
                {submitting ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
                ) : (
                  <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Accept Proposal</>
                )}
              </button>

              <p className="mt-4 text-center text-xs text-gray-400">
                Prefer to print?{" "}
                <button
                  onClick={() => window.open(`/print/proposal/${bidId}`, "_blank")}
                  className="underline hover:text-gray-600 transition-colors"
                >
                  Print this page
                </button>{" "}
                and mail the signed copy to 3161 Carrollton Rd., Saginaw, MI 48604.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
