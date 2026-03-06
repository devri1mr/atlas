"use client";

import { useParams } from "next/navigation";

export default function ProposalPage() {
  const params = useParams();
  const bidId = params?.id;

  return (
    <div className="p-8 space-y-8">

      {/* Page 1 */}
      <div className="border p-10 bg-white shadow max-w-[800px] mx-auto">

        <h1 className="text-2xl font-bold mb-6">Garpiel Group Estimate</h1>

        <div className="grid grid-cols-2 gap-6 text-sm mb-6">
          <div>
            <div className="font-semibold">Customer</div>
            <div>Client Name</div>
            <div>Client Address</div>
          </div>

          <div className="text-right">
            <div>Estimate #: {bidId}</div>
            <div>Project: Landscaping</div>
            <div>Date: Today</div>
            <div>Valid Until: 30 Days</div>
          </div>
        </div>

        <div className="mb-4 font-semibold">
          Project Description
        </div>

        <div className="text-sm space-y-1">
          <div>• Example scope item</div>
          <div>• Example scope item</div>
          <div>• Example scope item</div>
        </div>

        <div className="mt-10 text-right text-lg font-semibold">
          Total: $0.00
        </div>

      </div>

      {/* Page Break */}

      <div className="border-t pt-8 max-w-[800px] mx-auto">

        <h2 className="text-xl font-bold mb-4">
          Garpiel Group Terms of Service
        </h2>

        <div className="text-sm space-y-3 text-gray-700">
          <p>
            Terms and conditions will appear here exactly as they do on the
            current estimate document.
          </p>
        </div>

      </div>

    </div>
  );
}
