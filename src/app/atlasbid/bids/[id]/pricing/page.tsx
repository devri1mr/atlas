"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PricingPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [data, setData] = useState<any>(null);

  async function calculate() {
    const res = await fetch("/api/atlasbid/pricing/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bid_id: bidId }),
    });

    const json = await res.json();
    setData(json);
  }

  useEffect(() => {
    if (bidId) {
      calculate();
    }
  }, [bidId]);

  if (!data) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 space-y-4">

      <h1 className="text-2xl font-bold">Pricing</h1>

      <div>Labor Cost: ${data.labor_cost.toFixed(2)}</div>
      <div>Material Cost: ${data.material_cost.toFixed(2)}</div>

      <hr />

      <div>Total Cost: ${data.total_cost.toFixed(2)}</div>

      <div className="text-lg font-semibold">
        Final Price: ${data.rounded_price.toFixed(2)}
      </div>

      <div>Prepay Price: ${data.prepay_price.toFixed(2)}</div>

    </div>
  );
}
