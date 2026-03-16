"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DivisionRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

type MaterialsCatalogRow = {
  id: string;
  name: string;
  display_name?: string | null;
  unit?: string | null;
  inventory_unit?: string | null;
  vendor?: string | null;
  sku?: string | null;
  is_active?: boolean | null;
  division_id?: string | null;
};

type InventorySummaryRow = {
  material_id: string;
  material_name: string;
  location_id: string | null;
  location_name: string | null;
  qty_on_hand: number;
  avg_unit_cost: number;
  inventory_value: number;
  negative_flag: boolean;
  inventory_unit: string | null;
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
  invoiced_final?: boolean | null;
  materials?: {
    id?: string;
    name?: string;
    display_name?: string;
  };
};

const UNIT_OPTIONS = [
  { label: "yd(s)", value: "yd" },
  { label: "ea", value: "ea" },
  { label: "lin ft", value: "lf" },
  { label: "sq ft", value: "sqft" },
  { label: "tons", value: "ton" },
  { label: "bags", value: "bag" },
  { label: "gallons", value: "gal" },
];

function money(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function fmtQty(n: number) {
  const v = Number(n) || 0;
  return Number(v.toFixed(2)).toString();
}

function titleizeTransactionType(s: string) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function InventoryPage() {

  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [activeDivisionId, setActiveDivisionId] = useState("");

  const [materialsCatalog, setMaterialsCatalog] = useState<MaterialsCatalogRow[]>([]);

  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialResults, setShowMaterialResults] = useState(false);

  const materialDropdownRef = useRef<HTMLDivElement | null>(null);

  const [summary, setSummary] = useState<InventorySummaryRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedMaterialId, setSelectedMaterialId] = useState("");

  const [unit, setUnit] = useState("yd");
  const [unitLocked, setUnitLocked] = useState(false);

  const [quantity, setQuantity] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);

  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [invoicedFinal, setInvoicedFinal] = useState(false);

  const [tableSearch, setTableSearch] = useState("");

  async function loadLookups() {

    const [dRes, mRes] = await Promise.all([
      fetch("/api/divisions", { cache: "no-store" }),
      fetch("/api/materials-search", { cache: "no-store" }),
    ]);

    const dJson = await dRes.json();
    const mJson = await mRes.json();

    const dRows: DivisionRow[] = dJson?.divisions ?? dJson?.data ?? dJson ?? [];

    const activeDivs = Array.isArray(dRows)
      ? dRows.filter((d) => d?.is_active !== false)
      : [];

    setDivisions(activeDivs);

    if (!activeDivisionId && activeDivs.length > 0) {
      setActiveDivisionId(activeDivs[0].id);
    }

    const mRows: MaterialsCatalogRow[] =
      mJson?.rows ?? mJson?.data ?? mJson ?? [];

    setMaterialsCatalog(
      Array.isArray(mRows)
        ? mRows.filter((m) => m?.is_active !== false)
        : []
    );
  }

  async function loadData() {

    setLoading(true);

    const [summaryRes, ledgerRes] = await Promise.all([
      fetch("/api/inventory/summary", { cache: "no-store" }),
      fetch("/api/inventory/ledger", { cache: "no-store" }),
    ]);

    const summaryJson = await summaryRes.json();
    const ledgerJson = await ledgerRes.json();

    setSummary(summaryJson.data || []);
    setLedger(ledgerJson.data || []);

    setLoading(false);
  }

  useEffect(() => {
    loadLookups();
    loadData();
  }, []);

  const filteredSummary = useMemo(() => {

    const q = tableSearch.toLowerCase();

    return summary
      .filter((row) => {

        const hay = `${row.material_name} ${row.location_name || ""}`.toLowerCase();

        return !q || hay.includes(q);

      })

      .sort((a, b) => b.inventory_value - a.inventory_value);

  }, [summary, tableSearch]);

  const totalInventoryValue = useMemo(() => {

    return filteredSummary.reduce(
      (sum, row) => sum + (Number(row.inventory_value) || 0),
      0
    );

  }, [filteredSummary]);

  return (

    <div className="p-8 space-y-8">

      <div className="flex items-center justify-between">

        <h1 className="text-3xl font-bold">
          Inventory
        </h1>

        <div className="border rounded-lg px-4 py-3 bg-gray-50">

          <div className="text-xs text-gray-500">
            Total Inventory Value
          </div>

          <div className="text-xl font-bold">
            {money(totalInventoryValue)}
          </div>

        </div>

      </div>

      <div className="border rounded-lg p-3">

        <div className="flex gap-2 flex-wrap">

          {divisions.map((d) => {

            const active = d.id === activeDivisionId;

            return (

              <button
                key={d.id}
                onClick={() => setActiveDivisionId(d.id)}
                className={`px-4 py-2 rounded-md text-sm border ${
                  active
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white text-gray-700"
                }`}
              >
                {d.name}
              </button>

            );

          })}

        </div>

      </div>

      <div className="border rounded-lg p-6">

        <h2 className="text-xl font-semibold mb-4">
          Inventory Summary
        </h2>

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b text-left text-xs text-gray-500">

              <th className="py-2">Material</th>
              <th>Location</th>
              <th>Qty</th>
              <th>Avg Cost</th>
              <th>Value</th>

            </tr>

          </thead>

          <tbody>

            {filteredSummary.map((row) => (

              <tr
                key={row.material_id + (row.location_id || "")}
                className="border-b"
              >

                <td className="py-2">
                  {row.material_name}
                </td>

                <td>
                  {row.location_name || "-"}
                </td>

                <td>
                  {fmtQty(row.qty_on_hand)} {row.inventory_unit}
                </td>

                <td>
                  {money(row.avg_unit_cost)}
                </td>

                <td>
                  {money(row.inventory_value)}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      <div className="border rounded-lg p-6">

        <h2 className="text-xl font-semibold mb-4">
          Inventory Ledger
        </h2>

        <table className="w-full text-sm">

          <thead>

            <tr className="border-b text-left text-xs text-gray-500">

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

                <td>
                  {titleizeTransactionType(row.transaction_type)}
                </td>

                <td>
                  {fmtQty(row.quantity)}
                </td>

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

                <td>
                  {row.reference_number || "-"}
                </td>

                <td>
                  {row.notes || "-"}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}
