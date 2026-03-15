"use client";

import { useEffect, useMemo, useState } from "react";

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

const UNIT_OPTIONS = [
  { label: "yd(s)", value: "yd" },
  { label: "ea", value: "ea" },
  { label: "lf", value: "lf" },
  { label: "sq ft", value: "sqft" },
  { label: "ton", value: "ton" },
  { label: "bag", value: "bag" },
  { label: "gal", value: "gal" },
];

function money(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

export default function InventoryPage() {
  const [summary, setSummary] = useState<InventorySummaryRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("yd");
  const [quantity, setQuantity] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [reference, setReference] = useState("");
  const [invoicedFinal, setInvoicedFinal] = useState(false);
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

  const totalInventoryValue = useMemo(() => {
    return summary.reduce((sum, row) => sum + (row.inventory_value || 0), 0);
  }, [summary]);

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
        reference_number: reference,
        notes,
        invoiced_final: invoicedFinal,
      }),
    });

    setMaterialName("");
    setQuantity(0);
    setTotalCost(0);
    setReference("");
    setNotes("");
    setInvoicedFinal(false);

    await loadData();
  }

  return (
    <div className="p-8 space-y-8">

      {/* Header */}

      <div className="flex items-start justify-between">

        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <div className="text-sm text-gray-500 mt-1">
            Track inventory receipts and usage
          </div>
        </div>

        <div className="border rounded-lg px-6 py-4 text-right bg-gray-50">
          <div className="text-xs text-gray-500">Inventory Value</div>
          <div className="text-2xl font-bold">
            {money(totalInventoryValue)}
          </div>
        </div>

      </div>

      {/* Add Inventory */}

      <div className="border rounded-lg p-6 space-y-4">

        <h2 className="text-xl font-semibold">Add Inventory</h2>

        <div className="grid grid-cols-12 gap-3 items-end">

          <div className="col-span-3">
            <label className="text-xs font-semibold text-gray-600">
              Material
            </label>
            <input
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              className="border rounded p-2 w-full"
              placeholder="Material name"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">
              Unit
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="border rounded p-2 w-full"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">
              Qty
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="border rounded p-2 w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">
              Total Cost
            </label>
            <input
              type="number"
              value={totalCost}
              onChange={(e) => setTotalCost(Number(e.target.value))}
              className="border rounded p-2 w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded p-2 w-full"
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600">
              Reference #
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="border rounded p-2 w-full"
              placeholder="Invoice / Order"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={invoicedFinal}
              onChange={(e) => setInvoicedFinal(e.target.checked)}
            />
            <span className="text-sm">Final</span>
          </div>

          <div>
            <button
              onClick={createReceipt}
              className="bg-black text-white px-4 py-2 rounded w-full"
            >
              Add
            </button>
          </div>

        </div>

        {/* Notes */}

        <div>
          <label className="text-xs font-semibold text-gray-600">
            Notes
          </label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border rounded p-2 w-full"
            placeholder="Optional notes"
          />
        </div>

      </div>

      {/* Inventory Summary */}

      <div className="border rounded-lg p-6 space-y-4">

        <h2 className="text-xl font-semibold">Inventory Summary</h2>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="py-2 px-2">Material</th>
                <th>Location</th>
                <th>Qty</th>
                <th>Avg Cost</th>
                <th>Value</th>
              </tr>
            </thead>

            <tbody>

              {summary.map((row) => (

                <tr
                  key={row.material_id + row.location_id}
                  className={`border-b ${
                    row.negative_flag ? "bg-red-50" : ""
                  }`}
                >

                  <td className="py-2 px-2 font-medium">
                    {row.material_name}
                  </td>

                  <td>{row.location_name}</td>

                  <td>
                    {row.qty_on_hand} {row.inventory_unit}
                    {row.negative_flag && (
                      <span className="text-red-600 ml-2 text-xs">
                        LOW
                      </span>
                    )}
                  </td>

                  <td>{money(row.avg_unit_cost)}</td>

                  <td className="font-semibold">
                    {money(row.inventory_value)}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

      {/* Ledger */}

      <div className="border rounded-lg p-6 space-y-4">

        <h2 className="text-xl font-semibold">Inventory Ledger</h2>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="py-2 px-2">Date</th>
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

                  <td className="py-2 px-2">
                    {new Date(row.transaction_date).toLocaleDateString()}
                  </td>

                  <td>
                    {row.materials?.display_name || row.materials?.name}
                  </td>

                  <td className="capitalize">
                    {row.transaction_type}
                  </td>

                  <td>{row.quantity}</td>

                  <td>
                    {row.unit_cost !== null
                      ? money(row.unit_cost)
                      : "-"}
                  </td>

                  <td>
                    {row.total_cost !== null
                      ? money(row.total_cost)
                      : "-"}
                  </td>

                  <td>{row.reference_number}</td>

                  <td className="text-gray-600">{row.notes}</td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

      {loading && (
        <div className="text-sm text-gray-500">Loading…</div>
      )}

    </div>
  );
}
