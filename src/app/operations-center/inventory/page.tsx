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
  inventory_enabled: boolean;
  division_id?: string | null;
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
    inventory_unit?: string | null;
    division_id?: string | null;
  };
  inventory_locations?: {
    id?: string;
    name?: string;
  } | null;
  vendors?: {
    id?: string;
    name?: string;
  } | null;
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
  const [activeDivisionId, setActiveDivisionId] = useState<string>("");

  const [materialsCatalog, setMaterialsCatalog] = useState<MaterialsCatalogRow[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialResults, setShowMaterialResults] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement | null>(null);

  const [summary, setSummary] = useState<InventorySummaryRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("yd");
  const [unitLocked, setUnitLocked] = useState(false);
  const [quantity, setQuantity] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoicedFinal, setInvoicedFinal] = useState(false);
  const [notes, setNotes] = useState("");
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
      const landscaping =
        activeDivs.find((d) => (d.name || "").toLowerCase() === "landscaping") ??
        activeDivs[0];
      setActiveDivisionId(landscaping.id);
    }

    const mRows: MaterialsCatalogRow[] = mJson?.rows ?? mJson?.data ?? mJson ?? [];
    setMaterialsCatalog(
      Array.isArray(mRows) ? mRows.filter((m) => m?.is_active !== false) : []
    );
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [summaryRes, ledgerRes] = await Promise.all([
        fetch("/api/inventory/summary", { cache: "no-store" }),
        fetch("/api/inventory/ledger", { cache: "no-store" }),
      ]);

      const summaryJson = await summaryRes.json();
      const ledgerJson = await ledgerRes.json();

      setSummary(summaryJson?.data || []);
      setLedger(ledgerJson?.data || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLookups();
    loadData();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = materialDropdownRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setShowMaterialResults(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const activeDivision = useMemo(() => {
    return divisions.find((d) => d.id === activeDivisionId) || null;
  }, [divisions, activeDivisionId]);

  const filteredMaterialsCatalog = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();

    return materialsCatalog
      .filter((m) => {
        if (activeDivisionId && m.division_id && m.division_id !== activeDivisionId) {
          return false;
        }

        const hay = `${m.name || ""} ${m.display_name || ""} ${m.vendor || ""} ${m.sku || ""}`.toLowerCase();
        return !q || hay.includes(q);
      })
      .slice(0, 20);
  }, [materialsCatalog, materialSearch, activeDivisionId]);

  const filteredSummary = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();

    return summary.filter((row) => {
      if (activeDivisionId && row.division_id && row.division_id !== activeDivisionId) {
        return false;
      }

      const hay = `${row.material_name || ""} ${row.location_name || ""} ${row.inventory_unit || ""}`.toLowerCase();
      return !q || hay.includes(q);
    });
  }, [summary, activeDivisionId, tableSearch]);

  const filteredLedger = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();

    return ledger.filter((row) => {
      if (
        activeDivisionId &&
        row.materials?.division_id &&
        row.materials.division_id !== activeDivisionId
      ) {
        return false;
      }

      const materialText = row.materials?.display_name || row.materials?.name || "";
      const hay = `${materialText} ${row.transaction_type || ""} ${
        row.reference_number || ""
      } ${row.notes || ""} ${row.vendors?.name || ""} ${
        row.inventory_locations?.name || ""
      }`.toLowerCase();

      return !q || hay.includes(q);
    });
  }, [ledger, activeDivisionId, tableSearch]);

  const totalInventoryValue = useMemo(() => {
    return filteredSummary.reduce((sum, row) => sum + (Number(row.inventory_value) || 0), 0);
  }, [filteredSummary]);

  const negativeItemsCount = useMemo(() => {
    return filteredSummary.filter((row) => row.negative_flag).length;
  }, [filteredSummary]);

  const openReceiptsCount = useMemo(() => {
    return filteredLedger.filter(
      (row) => row.transaction_type === "receipt" && !row.invoiced_final
    ).length;
  }, [filteredLedger]);

  const totalItemsCount = useMemo(() => {
    return filteredSummary.length;
  }, [filteredSummary]);

  function applyMaterialSelection(m: MaterialsCatalogRow) {
    const display = (m.display_name || m.name || "").trim();

    setSelectedMaterialId(m.id || "");
    setMaterialName(display);
    setMaterialSearch(display);
    setShowMaterialResults(false);

    const forcedUnit = (m.inventory_unit || m.unit || "").trim();
    if (forcedUnit) {
      setUnit(forcedUnit);
      setUnitLocked(true);
    } else {
      setUnitLocked(false);
    }

    if (!vendorName.trim() && m.vendor) {
      setVendorName(m.vendor);
    }
  }

  function clearMaterialSelection(v: string) {
    setSelectedMaterialId("");
    setMaterialSearch(v);
    setMaterialName(v);
    setShowMaterialResults(true);
    setUnitLocked(false);
  }

  async function createReceipt() {
    if (!materialName.trim()) {
      setError("Material is required.");
      return;
    }

    if ((Number(quantity) || 0) <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/inventory/receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          material_id: selectedMaterialId || null,
          material_name: materialName.trim(),
          inventory_unit: unit,
          quantity: Number(quantity) || 0,
          total_cost: Number(totalCost) || 0,
          transaction_date: date,
          reference_number: referenceNumber.trim() || null,
          vendor_name: vendorName.trim() || null,
          notes: notes.trim() || null,
          invoiced_final: invoicedFinal,
          division_id: activeDivisionId || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to add inventory.");
      }

      setSelectedMaterialId("");
      setMaterialName("");
      setMaterialSearch("");
      setUnit("yd");
      setUnitLocked(false);
      setQuantity(0);
      setTotalCost(0);
      setReferenceNumber("");
      setVendorName("");
      setNotes("");
      setInvoicedFinal(false);

      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to add inventory.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <div className="text-sm text-gray-500 mt-1">
            {activeDivision ? `${activeDivision.name} inventory` : "Track inventory receipts and usage"}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-[720px] max-w-[900px] w-full lg:w-auto">
          <div className="border rounded-lg px-4 py-3 bg-gray-50">
            <div className="text-xs text-gray-500">Inventory Value</div>
            <div className="text-xl font-bold">{money(totalInventoryValue)}</div>
          </div>

          <div className="border rounded-lg px-4 py-3 bg-gray-50">
            <div className="text-xs text-gray-500">Items</div>
            <div className="text-xl font-bold">{totalItemsCount}</div>
          </div>

          <div className="border rounded-lg px-4 py-3 bg-gray-50">
            <div className="text-xs text-gray-500">Open Receipts</div>
            <div className="text-xl font-bold">{openReceiptsCount}</div>
          </div>

          <div className="border rounded-lg px-4 py-3 bg-gray-50">
            <div className="text-xs text-gray-500">Negative Items</div>
            <div className={`text-xl font-bold ${negativeItemsCount > 0 ? "text-red-600" : ""}`}>
              {negativeItemsCount}
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-3">
        <div className="flex flex-wrap gap-2">
          {divisions.map((d) => {
            const active = d.id === activeDivisionId;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveDivisionId(d.id)}
                className={`px-4 py-2 rounded-md text-sm border transition ${
                  active
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Add Inventory</h2>
            <div className="text-sm text-gray-500">
              Add receipts into {activeDivision?.name || "inventory"} using a saved material or a new material.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-600">
          <div className="col-span-3">Material</div>
          <div className="col-span-1">Unit</div>
          <div className="col-span-1">Qty</div>
          <div className="col-span-1">Total Cost</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2">Reference #</div>
          <div className="col-span-1">Final</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        <div className="grid grid-cols-12 gap-3 items-start">
          {/* MATERIAL SEARCH */}
          <div className="col-span-3 relative" ref={materialDropdownRef}>
            <input
              placeholder="Search or type material..."
              value={materialSearch}
              onChange={(e) => {
                const v = e.target.value;
                clearMaterialSelection(v);
              }}
              onFocus={() => setShowMaterialResults(true)}
              className="border rounded-md p-2 w-full"
            />

            {showMaterialResults && filteredMaterialsCatalog.length > 0 && (
              <div className="absolute z-20 bg-white border rounded-md shadow-md mt-1 max-h-60 overflow-y-auto w-full">
                {filteredMaterialsCatalog.map((m) => {
                  const display = m.display_name || m.name;
                  return (
                    <div
                      key={m.id}
                      onClick={() => applyMaterialSelection(m)}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {display}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* UNIT */}
          <div className="col-span-1">
            <select
              value={unit}
              disabled={unitLocked}
              onChange={(e) => setUnit(e.target.value)}
              className="border rounded-md p-2 w-full"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* QTY */}
          <div className="col-span-1">
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="border rounded-md p-2 w-full"
            />
          </div>

          {/* TOTAL COST */}
          <div className="col-span-1">
            <input
              type="number"
              value={totalCost}
              onChange={(e) => setTotalCost(Number(e.target.value))}
              className="border rounded-md p-2 w-full"
            />
          </div>

          {/* DATE */}
          <div className="col-span-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-md p-2 w-full"
            />
          </div>
