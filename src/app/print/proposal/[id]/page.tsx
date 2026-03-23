"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

// ── Types (same as proposal page) ──────────────────────────────────────────
type BidRow = {
  id: string; estimate_number?: string | number | null; bid_number?: string | number | null;
  client_name?: string | null; client_last_name?: string | null; customer_name?: string | null;
  address?: string | null; address1?: string | null; address2?: string | null;
  city?: string | null; state?: string | null; zip?: string | null;
  created_at?: string | null; sell_rounded?: number | null; sell_price?: number | null;
  total?: number | null; amount?: number | null; prepay_enabled?: boolean | null; prepay_price?: number | null;
};
type LaborRow = {
  id: string; task: string; proposal_text?: string | null; quantity?: number | null; unit?: string | null;
  man_hours?: number | null; hourly_rate?: number | null; show_as_line_item?: boolean | null;
  hidden_from_proposal?: boolean | null; bundle_run_id?: string | null; proposal_section?: string | null;
};
type BundleRunMeta = { id: string; bundle_id: string; bundle_name: string };

function cleanText(v?: string | null) {
  const s = String(v ?? "").trim();
  return (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") ? "" : s;
}
function formatDate(v?: string | null) {
  if (!v) return ""; const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
function moneyDisplay(value: number) {
  return `$${Math.round(Number(value) || 0).toLocaleString()}.00`;
}
function allocate(rows: { label: string; cost: number; children?: string[] }[], totalSell: number) {
  if (!rows.length) return [];
  const rounded = Math.round(Number(totalSell) || 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  if (rounded <= 0) return rows.map(r => ({ ...r, amount: 0 }));
  if (totalCost <= 0) {
    const base = Math.floor(rounded / rows.length); let run = 0;
    return rows.map((r, i) => { const a = i === rows.length - 1 ? rounded - run : base; run += a; return { ...r, amount: a }; });
  }
  let run = 0;
  return rows.map((r, i) => {
    if (i === rows.length - 1) return { ...r, amount: rounded - run };
    const a = Math.round((r.cost / totalCost) * rounded); run += a; return { ...r, amount: a };
  });
}

const TERMS = [
  { title: "General", body: "Garpiel Group will have any buried utilities marked prior to the project being started via Miss Dig. Garpiel Group is not responsible for any damages to underground sprinkler lines or private utilities (i,e. invisible pet fences, landscape lighting, underground downspouts, etc)." },
  { title: "Payment", body: "50% of total project cost will be due before a project start date is scheduled. The remaining (50%) and any additional cost will be due upon receipt of invoice within 7 days. Client agrees to pay a late fee of 1.5% per month on any unpaid balance. Payment can be made by either check or credit card. A maximum of $5,000 will be accepted by credit card payment per project. Should Garpiel Group be forced to institute collections proceedings against Client for any unpaid balance, Client agrees to pay Garpiel Group's reasonable costs and attorney fees." },
  { title: "Plant Warranty", body: "Any NEW plant (excludes transplants) installed by Garpiel Group carries a one-year warranty from the date of planting. Garpiel Group reserves the right to determine if the plant warrants replacement. A plant under warranty will only be replaced once. Garpiel Group will cover the cost of the plant & the property owner will incur a $55.00/hour labor rate for replacement of plants. Warranty does not cover any annuals, perennials, roses, tropical plants, or ornamental grasses. In addition it does not cover damage or death from invasive/exotic pests, snow plow damage, winter damage, fire, vandalism, and/or natural causes beyond Garpiel Group's control. The homeowner is responsible for all watering after plantings to ensure newly planted plant material receives adequate water. Watering service can be provided by Garpiel Group for additional cost. All warranty replacements will take place between April 15th - May 30th and September 1st - November 15th. If a plant health care fertilization package is purchased through Garpiel Group all plants will be warrantied for two years from the date of original planting." },
  { title: "Paver/Retaining Wall Warranty", body: "Garpiel Group will warranty workmanship along with any Unilock brand brick for two years from the date of installation. Garpiel Group will not warranty damages due to the homeowner, snow plow damage, fire, vandalism, and/or natural causes beyond our control." },
  { title: "Irrigation Warranty", body: "Garpiel Group warrants all parts for a period of one (1) year and workmanship for a period of two (2) years from the date of installation, provided that the system is maintained exclusively by Garpiel Group during this period. This warranty does not cover freeze damage if the system has not been properly winterized by Garpiel Group." },
  { title: "Notice Regarding Warranty", body: "Any notice given by Client pursuant to a warranty provision in this Contract shall be given to Garpiel Group in writing via certified mail, postage fully prepaid. Further, Garpiel Group specifically disclaims any and all other warranties and all implied warranties (either in fact or by operation of law) including, but not limited to, any implied warranties of merchantability and fitness for a particular purpose or any implied warranty arising out of a course of dealing, custom, or usage of trade." },
  { title: "Additional Work Request", body: "Garpiel Group shall perform only the services explicitly specified in this Contract. If Client would like to add any additional work that is not listed on this estimate, Client must contact their salesman prior to the beginning of project start date. No additional work will be completed without a new signed contract." },
  { title: "Limitation of Liability", body: "Garpiel Group shall be free from any liabilities (including structural or accidental) when using machinery, except for accidents caused by improper use. In no event shall Garpiel Group, its members, managers, employees, agents, or affiliates be responsible for indirect, special, nominal, incidental, punitive, or consequential losses or damages, or for any penalties, regardless of the legal or equitable theory asserted, including contract, negligence, warranty, strict liability, statute or otherwise, even if it had been aware of the possibility of such damages or they are foreseeable; or for claims by a third party. The maximum aggregate liability shall not exceed three times the amount paid by customer for the services or actual proven damages, whichever is less. It is expressly agreed that Client's remedy expressed herein is Client's exclusive remedy. The limitations set forth herein shall apply even if any other remedies fail of their essential purpose." },
  { title: "Delay/Disruption", body: "Garpiel Group undertakes to use all reasonable endeavors to complete the work within a reasonable time or by a specific date if agreed. Under no circumstances shall Garpiel Group incur any liability to Client for any untimely performance. Further, Garpiel Group shall not be held responsible for any delays caused by weather which make contract execution impossible." },
  { title: "Natural Occurrence", body: "Garpiel Group is not responsible for natural occurrences or acts of God such as cracks, splits, or spalls on any natural limestone, or effects of mother nature." },
  { title: "Jurisdiction and Venue", body: "This Contract shall be interpreted under the laws of the State of Michigan, and client agrees that any action at law or in equity arising out of, or relating to, this Contract must be filed and adjudicated only in the state courts located in Saginaw County, Michigan, or in the federal district court for the Eastern District of Michigan located in Bay City, Michigan. Client consents and submits to the personal and exclusive jurisdiction of such courts." },
  { title: "Maintenance After Completion", body: "Garpiel Group agrees to perform the scope of work outlined in this Contract. Upon completion of the work, responsibility for the proper maintenance of the site shall transfer to the Client, unless otherwise agreed to in writing by both parties. The determination of the completion of this Contract shall be at the sole discretion of Garpiel Group." },
  { title: "Fuel Surcharge", body: "In the event gas prices rise over $4.00 per gallon Garpiel Group may add a reasonable temporary surcharge to reflect increased fuel costs. The fuel surcharge will be calculated on a monthly basis." },
  { title: "Cancellation", body: "In the event that the client cancels the service, Garpiel shall be entitled to recovery of costs, fees and administrative expenses incurred, whether or not yet paid, in furtherance of the engagement on behalf of the client. Those costs and expenses shall be deducted from the deposit provided by the client in an amount of actual costs incurred or ten (10%) percent of the deposit, whichever is greater. Any costs and expenses incurred in excess of the deposit shall be billed to the client with payment due as provided in this Agreement subject to a late fee of one and one-half (1.5%) percent per month on any unpaid balance." },
  { title: "Severability", body: "The provisions of this Contract are fully severable." },
];

export default function PrintProposalPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [bid, setBid]           = useState<BidRow | null>(null);
  const [labor, setLabor]       = useState<LaborRow[]>([]);
  const [bundlesMeta, setBundlesMeta] = useState<BundleRunMeta[]>([]);

  useEffect(() => {
    if (!bidId) return;
    let cancelled = false;
    async function load() {
      try {
        const [bidRes, laborRes, brRes] = await Promise.all([
          fetch(`/api/bids/${bidId}`, { cache: "no-store" }),
          fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" }),
          fetch(`/api/atlasbid/bundle-runs?bid_id=${bidId}`, { cache: "no-store" }),
        ]);
        const [bidJson, laborJson, brJson] = await Promise.all([bidRes.json(), laborRes.json(), brRes.json()]);
        if (!cancelled) {
          setBid(bidJson?.data ?? bidJson?.row ?? bidJson ?? null);
          const rows = laborJson?.data ?? laborJson?.rows ?? laborJson ?? [];
          setLabor(Array.isArray(rows) ? rows : []);
          setBundlesMeta(Array.isArray(brJson?.rows) ? brJson.rows : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bidId]);

  // Auto-print once loaded
  useEffect(() => {
    if (!loading && !error) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, error]);

  const clientFullName = useMemo(() => {
    const co = cleanText(bid?.customer_name);
    if (co) return co;
    return [cleanText(bid?.client_name), cleanText(bid?.client_last_name)].filter(Boolean).join(" ") || "Client";
  }, [bid]);

  const addressLine1 = useMemo(() => cleanText(bid?.address1 || bid?.address), [bid]);
  const addressLine2 = useMemo(() => {
    const a2 = cleanText(bid?.address2);
    if (a2) return a2;
    const city = cleanText(bid?.city), state = cleanText(bid?.state), zip = cleanText(bid?.zip);
    return `${[city, state].filter(Boolean).join(", ")}${zip ? ` ${zip}` : ""}`.trim();
  }, [bid]);

  const estimateNumber = useMemo(() => String(bid?.estimate_number ?? bid?.bid_number ?? bidId.slice(0, 6)), [bid, bidId]);
  const dateText = useMemo(() => formatDate(bid?.created_at) || formatDate(new Date().toISOString()), [bid]);
  const amountValue = useMemo(() => Number(bid?.sell_rounded ?? bid?.sell_price ?? bid?.total ?? bid?.amount ?? 0), [bid]);
  const totalDisplay = useMemo(() => bid?.prepay_enabled && Number(bid?.prepay_price ?? 0) > 0 ? Number(bid.prepay_price) : amountValue, [bid, amountValue]);

  const bundleNameMap = useMemo(() => new Map(bundlesMeta.map(x => [x.id, x.bundle_name])), [bundlesMeta]);

  const proposalRows = useMemo(() => {
    const base: { label: string; cost: number; children?: string[] }[] = [];
    const usedBundles = new Set<string>(); const usedSections = new Set<string>();
    for (const row of labor) {
      if (row.hidden_from_proposal) continue;
      const brid = row.bundle_run_id || null;
      const sec = row.proposal_section?.trim() || null;
      const cost = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
      if (brid && row.show_as_line_item !== true) {
        if (usedBundles.has(brid)) continue; usedBundles.add(brid);
        const bRows = labor.filter(r => r.bundle_run_id === brid && r.show_as_line_item !== true && !r.hidden_from_proposal);
        if (!bRows.length) continue;
        const bCost = bRows.reduce((s, r) => s + (Number(r.man_hours)||0)*(Number(r.hourly_rate)||0), 0);
        base.push({ label: `BUNDLE:${bundleNameMap.get(brid)||"Bundled Scope"}`, cost: bCost, children: bRows.map(r => cleanText(r.proposal_text)||cleanText(r.task)).filter(Boolean) });
        continue;
      }
      if (sec && !brid) {
        if (usedSections.has(sec)) continue; usedSections.add(sec);
        const sRows = labor.filter(r => !r.hidden_from_proposal && !r.bundle_run_id && r.proposal_section?.trim() === sec);
        const sCost = sRows.reduce((s, r) => s + (Number(r.man_hours)||0)*(Number(r.hourly_rate)||0), 0);
        base.push({ label: `SECTION:${sec}`, cost: sCost, children: sRows.map(r => cleanText(r.proposal_text)||cleanText(r.task)).filter(Boolean) });
        continue;
      }
      const parts = [cleanText(row.proposal_text)||cleanText(row.task)].filter(Boolean);
      if ((Number(row.quantity)||0) > 0 && row.unit) parts.push(`${row.quantity} ${row.unit}`);
      base.push({ label: parts.join(" — "), cost });
    }
    return allocate(base, totalDisplay);
  }, [labor, bundleNameMap, totalDisplay]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"Arial, sans-serif", color:"#666" }}>
      Loading proposal…
    </div>
  );
  if (error) return (
    <div style={{ padding:32, fontFamily:"Arial, sans-serif", color:"#dc2626" }}>Error: {error}</div>
  );

  const projectTotal = proposalRows.reduce((s, r) => s + (Number(r.amount)||0), 0);
  const prepayEnabled = Boolean(bid?.prepay_enabled);
  const prepayPrice = prepayEnabled ? Number(bid?.prepay_price||0) : 0;
  const prepayDiscPct = projectTotal > 0 ? Math.round(((projectTotal-prepayPrice)/projectTotal)*100) : 0;
  const prepayDiscAmt = Math.max(0, Math.round((projectTotal-prepayPrice)*100)/100);
  const showPrepay = prepayEnabled && prepayPrice > 0 && prepayPrice < projectTotal;

  const PAGE: React.CSSProperties = {
    width: "8.5in", minHeight: "11in", margin: "0 auto", background: "#fff",
    fontFamily: "Arial, Helvetica, sans-serif", color: "#000", boxSizing: "border-box",
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: letter portrait; margin: 0.65in 0.7in; }
          body { margin: 0; }
        }
        @media screen {
          body { background: #e5e7eb; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print" style={{ position:"sticky", top:0, zIndex:10, background:"#1a1a1a", padding:"10px 20px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ color:"#fff", fontSize:14, fontWeight:600, flex:1 }}>Print Preview — {clientFullName}</span>
        <button
          onClick={() => window.print()}
          style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:"8px 20px", fontSize:13, fontWeight:700, cursor:"pointer" }}
        >
          Print
        </button>
        <button
          onClick={() => window.close()}
          style={{ background:"#374151", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer" }}
        >
          Close
        </button>
      </div>

      {/* ── PAGE 1: PROPOSAL ── */}
      <div style={{ ...PAGE, padding: "0.4in 0.7in" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ width:270, paddingTop:8 }}>
            <img src="/garpiel-logo.jpg" alt="Garpiel Group" style={{ width:210, height:"auto" }} />
          </div>
          <div style={{ width:220, paddingTop:12, textAlign:"right", fontSize:13, lineHeight:1.45 }}>
            <div>Garpiel Group</div><div>3161 Carrollton Rd.</div>
            <div>Saginaw, MI 48604</div><div>Phone: (989) 797 4749</div>
            <div>www.GarpielGroup.com</div>
            <div style={{ marginTop:16, display:"inline-block", background:"#4b4b4b", padding:"2px 12px", fontSize:16, fontWeight:700, letterSpacing:"0.02em", color:"#fff" }}>
              LANDSCAPE ESTIMATE
            </div>
          </div>
        </div>

        {/* Client */}
        <div style={{ marginTop:32, paddingLeft:8, fontSize:14, lineHeight:1.55 }}>
          <div>{clientFullName}</div>
          {addressLine1 && <div>{addressLine1}</div>}
          {addressLine2 && <div>{addressLine2}</div>}
        </div>

        {/* Meta */}
        <div style={{ marginTop:32, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", fontSize:14 }}>
          <div><strong>Estimate #:</strong> {estimateNumber}</div>
          <div style={{ textAlign:"center" }}><strong>Project:</strong> {clientFullName}</div>
          <div style={{ textAlign:"right" }}><strong>Date:</strong> {dateText}</div>
        </div>

        {/* Title */}
        <div style={{ marginTop:32, textAlign:"center", fontSize:20, fontWeight:600, color:"#4a4a4a" }}>
          Landscape Project - Estimate is valid for 30 days.
        </div>
        <div style={{ marginTop:4, textAlign:"center" }}>
          <span style={{ background:"#f4ecb8", padding:"0 4px", fontSize:14, fontStyle:"italic", color:"#5b5b5b" }}>
            A 50% down payment is due along with a signed contract to move forward with project.
          </span>
        </div>

        {/* Table */}
        <div style={{ marginTop:28, border:"1px solid #8f8f8f" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px", borderBottom:"1px solid #8f8f8f" }}>
            <div style={{ borderRight:"1px solid #8f8f8f", padding:"8px 16px", fontSize:14, fontWeight:600 }}>Project Description</div>
            <div style={{ padding:"8px 16px", textAlign:"right", fontSize:14, fontWeight:600 }}>Amount</div>
          </div>

          <div style={{ minHeight:360 }}>
            {proposalRows.length === 0 ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 150px" }}>
                <div style={{ borderRight:"1px solid #8f8f8f", padding:"12px 16px", fontSize:14 }}>Project scope will appear here.</div>
                <div style={{ padding:"12px 16px", textAlign:"right", fontSize:14 }}>{moneyDisplay(0)}</div>
              </div>
            ) : proposalRows.map((row, idx) => {
              const lbl = String(row.label||"");
              const isB = lbl.startsWith("BUNDLE:"); const isS = lbl.startsWith("SECTION:");
              const name = isB ? lbl.slice(7) : isS ? lbl.slice(8) : lbl;
              const kids: string[] = (row as any).children ?? [];
              return (
                <div key={idx} style={{ display:"grid", gridTemplateColumns:"1fr 150px", borderBottom:"1px solid #8f8f8f" }}>
                  <div style={{ borderRight:"1px solid #8f8f8f", padding:"12px 16px", fontSize:14, lineHeight:1.55 }}>
                    {(isB||isS) ? (
                      <>
                        <div style={{ fontWeight:600, marginBottom: kids.length ? 4 : 0 }}>{name}</div>
                        {kids.map((c, i) => <div key={i} style={{ paddingLeft:16, color:"#444" }}>— {c}</div>)}
                      </>
                    ) : <div>{lbl}</div>}
                  </div>
                  <div style={{ padding:"12px 16px", textAlign:"right", fontSize:14 }}>{moneyDisplay((row as any).amount)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px", borderTop:"1px solid #8f8f8f" }}>
            <div style={{ borderRight:"1px solid #8f8f8f", padding:"12px 16px", textAlign:"right", fontSize:14, fontWeight:600 }}>Project Total</div>
            <div style={{ padding:"12px 16px", textAlign:"right", fontSize:14, fontWeight:600 }}>{moneyDisplay(projectTotal)}</div>
          </div>

          {showPrepay && <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 150px", borderTop:"1px solid #8f8f8f" }}>
              <div style={{ borderRight:"1px solid #8f8f8f", padding:"12px 16px", textAlign:"right", fontSize:14, color:"#555" }}>Prepay Discount ({prepayDiscPct}%)</div>
              <div style={{ padding:"12px 16px", textAlign:"right", fontSize:14, color:"#555" }}>-{moneyDisplay(prepayDiscAmt)}</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 150px", borderTop:"1px solid #8f8f8f" }}>
              <div style={{ borderRight:"1px solid #8f8f8f", padding:"12px 16px", textAlign:"right", fontSize:14, fontWeight:700 }}>Price with Prepay</div>
              <div style={{ padding:"12px 16px", textAlign:"right", fontSize:14, fontWeight:700 }}>{moneyDisplay(prepayPrice)}</div>
            </div>
          </>}
        </div>
      </div>

      {/* ── PAGE 2: TERMS ── */}
      <div style={{ ...PAGE, padding: "0.4in 0.7in 0.5in 0.7in", breakBefore:"page", pageBreakBefore:"always" }}>
        <h1 style={{ textAlign:"center", fontSize:22, fontWeight:700, marginBottom:24 }}>
          Garpiel Group Terms of Service
        </h1>

        <div style={{ fontSize:13.5, lineHeight:1.58, color:"#1a1a1a" }}>
          {TERMS.map(({ title, body }) => (
            <p key={title} style={{ marginBottom:10 }}>
              <strong>{title}:</strong> {body}
            </p>
          ))}
        </div>

        <p style={{ marginTop:24, textAlign:"center", fontSize:13.5, fontWeight:700 }}>
          ** ALL WARRANTIES ARE VOID IF CLIENT&apos;S ACCOUNT IS NOT IN GOOD STANDING**
        </p>

        <p style={{ marginTop:24, fontSize:13.5, lineHeight:1.58 }}>
          <strong>Acceptance of Proposal:</strong> The price, specifications and conditions are satisfactory and are hereby accepted. Garpiel Group is authorized to do the work, as specified. Payment will be made, as outlined above.
        </p>

        <div style={{ marginTop:80, width:320, margin:"80px auto 0", borderBottom:"1px solid #000" }} />
        <p style={{ marginTop:8, textAlign:"center", fontSize:13.5 }}>Signature</p>
      </div>
    </>
  );
}
