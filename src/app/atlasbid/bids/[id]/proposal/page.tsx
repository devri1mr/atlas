// src/app/atlasbid/bids/[id]/proposal/page.tsx
"use client";

import { useParams } from "next/navigation";

export default function ProposalPage() {
  const params = useParams();
  const bidId = params?.id as string;

  // TEMP placeholders until we connect real bid data
  const customerName = "Client Name";
  const customerAddress1 = "Client Address";
  const customerAddress2 = "";
  const estimateNumber = bidId;
  const projectName = "Landscaping";
  const dateText = "Today";
  const validityText = "Landscape Project - Estimate is valid for 30 days.";
  const depositText =
    "A 50% down payment is due along with a signed contract to move forward with project.";
  const scopeLines = [
    "Example scope item",
    "Example scope item",
    "Example scope item",
  ];
  const amountText = "$0.00";

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
          {/* Left logo block */}
          <div className="w-[270px] pt-2">
            <img
              src="/garpiel-logo.jpg"
              alt="Garpiel Group"
              className="w-[210px] h-auto"
            />
          </div>

          {/* Right company block */}
          <div className="w-[220px] text-right text-[13px] leading-[1.45] pt-3">
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
          <div>{customerName}</div>
          <div>{customerAddress1}</div>
          {customerAddress2 ? <div>{customerAddress2}</div> : null}
        </div>

        {/* Estimate / Project / Date row */}
        <div className="mt-8 grid grid-cols-3 text-[14px]">
          <div className="text-left">
            <span className="font-semibold">Estimate #:</span> {estimateNumber}
          </div>
          <div className="text-center">
            <span className="font-semibold">Project:</span> {projectName}
          </div>
          <div className="text-right">
            <span className="font-semibold">Date:</span> {dateText}
          </div>
        </div>

        {/* Validity line */}
        <div className="mt-8 text-center text-[20px] font-semibold leading-tight text-[#4a4a4a]">
          {validityText}
        </div>

        {/* Deposit line */}
        <div className="mt-1 text-center">
          <span className="bg-[#f4ecb8] px-1 text-[14px] italic text-[#5b5b5b]">
            {depositText}
          </span>
        </div>

        {/* Description / Amount table */}
        <div className="mt-7 border border-[#8f8f8f]">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_150px] border-b border-[#8f8f8f]">
            <div className="border-r border-[#8f8f8f] px-4 py-2 text-[14px] font-semibold">
              Project Description
            </div>
            <div className="px-4 py-2 text-right text-[14px] font-semibold">
              Amount
            </div>
          </div>

          {/* Body row */}
          <div className="grid grid-cols-[1fr_150px]">
            <div className="min-h-[360px] border-r border-[#8f8f8f] px-4 py-3 text-[14px] leading-[1.55]">
              {scopeLines.map((line, idx) => (
                <div key={`${line}-${idx}`}>- {line}</div>
              ))}
            </div>

            <div className="px-4 py-3 text-right text-[14px]">{amountText}</div>
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
