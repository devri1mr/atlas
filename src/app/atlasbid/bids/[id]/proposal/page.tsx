"use client";

import { useParams } from "next/navigation";

export default function ProposalPage() {
  const params = useParams();
  const bidId = params?.id;

  return (
    <div className="p-8">

      {/* PAGE CONTAINER */}
      <div className="max-w-[800px] mx-auto bg-white border p-10">

        {/* HEADER */}
        <div className="flex items-start justify-between mb-8">

          <div className="flex items-center gap-6">
            <img
              src="/garpiel-logo.jpg"
              alt="Garpiel Group"
              className="h-20"
            />

            <div className="text-sm text-gray-700">
              <div>3161 Carrollton Rd.</div>
              <div>Saginaw, MI 48604</div>
              <div>(989) 797-4749</div>
              <div>www.GarpielGroup.com</div>
            </div>
          </div>

        </div>

        {/* ESTIMATE TITLE */}
        <h2 className="text-xl font-bold mb-6">
          LANDSCAPE ESTIMATE
        </h2>

        {/* CUSTOMER + ESTIMATE INFO */}
        <div className="grid grid-cols-2 mb-6 text-sm">

          <div>
            <div className="font-semibold mb-2">Customer</div>
            <div>Client Name</div>
            <div>Client Address</div>
          </div>

          <div className="text-right space-y-1">
            <div>Estimate #: {bidId}</div>
            <div>Project: Landscaping</div>
            <div>Date: Today</div>
            <div>Valid Until: 30 Days</div>
          </div>

        </div>

        {/* PAYMENT NOTE */}
        <div className="text-sm mb-6">
          A 50% down payment is due upon acceptance of this estimate. Remaining balance due upon completion.
        </div>

        {/* PROJECT DESCRIPTION */}
        <div className="mb-2 font-semibold">
          Project Description
        </div>

        <div className="text-sm space-y-1 mb-10">
          <div>• Example scope item</div>
          <div>• Example scope item</div>
          <div>• Example scope item</div>
        </div>

        {/* TOTAL */}
        <div className="text-right text-lg font-semibold">
          Total: $0.00
        </div>

      </div>

      {/* PAGE BREAK */}
      <div className="h-20"></div>

      {/* TERMS PAGE */}
      <div className="max-w-[800px] mx-auto bg-white border p-10">

        <h2 className="text-xl font-bold mb-6">
          Garpiel Group Terms of Service
        </h2>

        <div className="text-sm text-gray-700 space-y-4">

          <p>
            Terms and conditions will appear here exactly as they do on the current estimate document.
          </p>

          <p>
            This section will be replaced with the full terms text from the existing estimate template.
          </p>

        </div>

      </div>

    </div>
  );
}
