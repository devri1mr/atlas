"use client";

import { useEffect, useState } from "react";

type InventorySummaryRow = {
  material_id: string;
  material_name: string;
  location_id: string;
  location_name: string;
  qty_on_hand: number;
  avg_unit_cost: number;
  inventory_value: number;
  negative_flag: boolean;
  inventory_unit: string | null;
  inventory_enabled: boolean;
};

type LedgerRow = {
  id: string;
  material_id: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  transaction_type: string;
  transaction_date: string;
  reference_number: string | null;
  notes: string | null;
  materials?: {
    name?: string;
    display_name?: string;
  };
};

export default function InventoryPage() {
  const [summary, setSummary] = useState<InventorySummaryRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("yd");
  const [quantity, setQuantity] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  async function loadData() {
    setLoading(true);

    const summaryRes = await fetch("/api/inventory/summary");
    const summaryJson = await summaryRes.json();

    const ledgerRes = await fetch("/api/inventory/ledger");
    const ledgerJson = await ledgerRes.json();

    setSummary(summaryJson.data || []);
    setLedger(ledgerJson.data || []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createReceipt() {
    if (!materialName || quantity <= 0) return;

    await fetch("/api/inventory/receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        material_name: materialName,
        inventory_unit: unit,
        quantity,
        total_cost: totalCost,
        transaction_date: date,
        notes,
        invoiced_final: false,
      }),
    });

    setMaterialName("");
    setQuantity(0);
    setTotalCost(0);
    setNotes("");

    await loadData();
  }

  return (
    <div className="p-6 space-y-8">

      <h1 className="text-2xl font-semibold">Inventory</h1>

      {/* Receipt Form */}

      <div className="border rounded p-4 space-y-4">
        <h2 className="text-lg font-semibold">Add Inventory</h2>

        <div className="grid grid-cols-6 gap-3">

          <input
            placeholder="Material"
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
            className="border p-2 col-span-2"
          />

          <input
            placeholder="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="border p-2"
          />

          <input
            type="number"
            placeholder="Qty"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="border p-2"
          />

          <input
            type="number"
            placeholder="Total Cost"
            value={totalCost}
            onChange={(e) => setTotalCost(Number(e.target.value))}
            className="border p-2"
          />

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border p-2"
          />

          <input
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border p-2 col-span-4"
          />

          <button
            onClick={createReceipt}
            className="bg-black text-white px-4 py-2 rounded"
          >
            Add Inventory
          </button>

        </div>
      </div>

      {/* Summary Table */}

      <div className="border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">Inventory Summary</h2>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Material</th>
              <th>Location</th>
              <th>Qty</th>
              <th>Avg Cost</th>
              <th>Value</th>
            </tr>
          </thead>

          <tbody>
            {summary.map((row) => (
              <tr key={row.material_id + row.location_id} className="border-b">

                <td className="py-2">{row.material_name}</td>

                <td>{row.location_name}</td>

                <td>
                  {row.qty_on_hand} {row.inventory_unit}
                </td>

                <td>${row.avg_unit_cost.toFixed(2)}</td>

                <td>${row.inventory_value.toFixed(2)}</td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ledger */}

      <div className="border rounded p-4">

        <h2 className="text-lg font-semibold mb-3">Inventory Ledger</h2>

        <table className="w-full text-sm">

          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Date</th>
              <th>Material</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Total</th>
              <th>Reference</th>
              <th>Notes</th>
            </tr>
          </thead>

          <tbody>
            {ledger.map((row) => (
              <tr key={row.id} className="border-b">

                <td className="py-2">
                  {new Date(row.transaction_date).toLocaleDateString()}
                </td>

                <td>
                  {row.materials?.display_name || row.materials?.name}
                </td>

                <td>{row.transaction_type}</td>

                <td>{row.quantity}</td>

                <td>
                  {row.unit_cost !== null ? `$${row.unit_cost.toFixed(2)}` : "-"}
                </td>

                <td>
                  {row.total_cost !== null
                    ? `$${row.total_cost.toFixed(2)}`
                    : "-"}
                </td>

                <td>{row.reference_number}</td>

                <td>{row.notes}</td>

              </tr>
            ))}
          </tbody>

        </table>

      </div>

      {loading && <div>Loading...</div>}

    </div>
  );
}
