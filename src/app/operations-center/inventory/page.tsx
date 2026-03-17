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
  division_id?: string | null;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  transaction_type: string;
  transaction_date: string;
  reference_number: string | null;
  notes: string | null;
  invoiced_final?: boolean | null;
  vendor_name?: string | null;
  materials?: {
    id?: string;
    name?: string;
    display_name?: string;
    inventory_unit?: string | null;
  };
  inventory_locations?: {
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
function formatDateOnly(v: string | null | undefined) {
  if (!v) return "—";

  const raw = String(v).slice(0, 10);
  const [y, m, d] = raw.split("-");

  if (!y || !m || !d) return raw;

  return `${Number(m)}/${Number(d)}/${y}`;
}
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
  const [error, setError] = useState("");

  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);

  const [selectedMaterialId, setSelectedMaterialId] = useState("");
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

  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);

  async function loadLookups() {
    try {
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
    } catch (e: any) {
      setError(e?.message || "Failed to load inventory lookups.");
    }
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [summaryRes, ledgerRes] = await Promise.all([
  fetch(`/api/inventory/summary?division_id=${activeDivisionId}`, { cache: "no-store" }),
  fetch(`/api/inventory/ledger?division_id=${activeDivisionId}`, { cache: "no-store" }),
]);

      const summaryJson = await summaryRes.json();
      const ledgerJson = await ledgerRes.json();

      setSummary(Array.isArray(summaryJson?.data) ? summaryJson.data : []);
      setLedger(Array.isArray(ledgerJson?.data) ? ledgerJson.data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  loadLookups();
}, []);

useEffect(() => {
  if (!activeDivisionId) return;
  loadData();
}, [activeDivisionId]);

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

  const materialDivisionMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of materialsCatalog) {
      map.set(m.id, m.division_id || null);
    }
    return map;
  }, [materialsCatalog]);

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

    return summary
      .filter((row) => {
        if (activeDivisionId && row.division_id && row.division_id !== activeDivisionId) {
  return false;
}

        const hay = `${row.material_name || ""} ${row.location_name || ""} ${row.inventory_unit || ""}`.toLowerCase();
        return !q || hay.includes(q);
      })
      .sort((a, b) => Number(b.inventory_value || 0) - Number(a.inventory_value || 0));
  }, [summary, activeDivisionId, tableSearch, materialDivisionMap]);

  const filteredLedger = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();

    return ledger.filter((row) => {
      if (activeDivisionId && row.division_id && row.division_id !== activeDivisionId) {
  return false;
}

      const materialText = row.materials?.display_name || row.materials?.name || "";
      const hay = `${materialText} ${row.transaction_type || ""} ${row.reference_number || ""} ${row.notes || ""} ${row.vendor_name || ""}`.toLowerCase();

      return !q || hay.includes(q);
    });
  }, [ledger, activeDivisionId, tableSearch, materialDivisionMap]);

  const totalInventoryValue = useMemo(() => {
    return filteredSummary.reduce(
      (sum, row) => sum + (Number(row.inventory_value) || 0),
      0
    );
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

function startEditReceipt(row: LedgerRow) {
  setEditingReceiptId(row.id);
  setSelectedMaterialId(row.material_id || "");
  setMaterialName(row.materials?.display_name || row.materials?.name || "");
  setMaterialSearch(row.materials?.display_name || row.materials?.name || "");
  setUnit(row.materials?.inventory_unit || "yd");
  setUnitLocked(false);
  setQuantity(Number(row.quantity) || 0);
  setTotalCost(Number(row.total_cost) || 0);
  setDate(String(row.transaction_date || "").slice(0, 10));
  setReferenceNumber(row.reference_number || "");
  setVendorName(row.vendor_name || "");
  setNotes(row.notes || "");
  setInvoicedFinal(Boolean(row.invoiced_final));
}

async function voidReceipt(id: string) {
  try {
    const res = await fetch(`/api/inventory/receipt/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error || "Failed to void transaction.");
    }

    if (editingReceiptId === id) {
      setEditingReceiptId(null);
      setSelectedMaterialId("");
      setMaterialName("");
      setMaterialSearch("");
      setUnit("yd");
      setUnitLocked(false);
      setQuantity(0);
      setTotalCost(0);
      setDate(new Date().toISOString().slice(0, 10));
      setReferenceNumber("");
      setVendorName("");
      setNotes("");
      setInvoicedFinal(false);
    }

    await loadData();
  } catch (e: any) {
    setError(e?.message || "Failed to void transaction.");
  }
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
    let res: Response;

    if (editingReceiptId) {
      const patchPayload = {
        quantity: Number(quantity) || 0,
        total_cost: Number(totalCost) || 0,
        unit_cost:
          (Number(quantity) || 0) > 0
            ? Number((Number(totalCost) / Number(quantity)).toFixed(4))
            : 0,
        transaction_date: date,
        reference_number: referenceNumber.trim() || null,
        vendor_name: vendorName.trim() || null,
        notes: notes.trim() || null,
        invoiced_final: invoicedFinal,
      };

      res = await fetch(`/api/inventory/receipt/${editingReceiptId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchPayload),
      });
    } else {
      const postPayload = {
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
      };

      res = await fetch("/api/inventory/receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postPayload),
      });
    }

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error || "Failed to save inventory.");
    }

    setEditingReceiptId(null);
    setSelectedMaterialId("");
    setMaterialName("");
    setMaterialSearch("");
    setUnit("yd");
    setUnitLocked(false);
    setQuantity(0);
    setTotalCost(0);
    setDate(new Date().toISOString().slice(0, 10));
    setReferenceNumber("");
    setVendorName("");
    setNotes("");
    setInvoicedFinal(false);

    await loadData();
  } catch (e: any) {
    setError(e?.message || "Failed to save inventory.");
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
            {activeDivision
              ? `${activeDivision.name} inventory`
              : "Track inventory receipts and usage"}
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
        <div>
          <h2 className="text-xl font-semibold">Add Inventory</h2>
          <div className="text-sm text-gray-500">
            Add receipts into {activeDivision?.name || "inventory"} using a saved material or a new material.
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
          <div className="col-span-3 relative" ref={materialDropdownRef}>
            <input
              placeholder="Search or type material..."
              value={materialSearch}
              onChange={(e) => {
                const v = e.target.value;
                clearMaterialSelection(v);
              }}
              onFocus={() => setShowMaterialResults(true)}
              className="border rounded-md p-2 w-full h-10"
            />

            {showMaterialResults && filteredMaterialsCatalog.length > 0 ? (
              <div className="absolute z-20 bg-white border rounded-md shadow-md mt-1 max-h-60 overflow-y-auto w-full">
                {filteredMaterialsCatalog.map((m) => {
                  const display = m.display_name || m.name;
                  return (
                    <div
                      key={m.id}
                      onClick={() => applyMaterialSelection(m)}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      <div className="font-medium">{display}</div>
                      <div className="text-xs text-gray-500">
                        {m.vendor ? `Vendor: ${m.vendor} • ` : ""}
                        Unit: {m.inventory_unit || m.unit || "—"}
                        {m.sku ? ` • SKU: ${m.sku}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="col-span-1">
            <select
              value={unit}
              disabled={unitLocked}
              onChange={(e) => setUnit(e.target.value)}
              className={`border rounded-md p-2 w-full h-10 ${
                unitLocked ? "bg-gray-100 text-gray-600 cursor-not-allowed" : ""
              }`}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-1">
            <input
              type="number"
              value={quantity === 0 ? "" : quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="border rounded-md p-2 w-full h-10"
            />
          </div>

          <div className="col-span-1 relative">

  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
    $
  </span>

  <input
    type="number"
    value={totalCost === 0 ? "" : totalCost}
    onChange={(e) => setTotalCost(Number(e.target.value))}
    className="border rounded-md p-2 pl-7 w-full h-10"
  />

</div>

          <div className="col-span-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-md p-2 w-full h-10 min-w-[180px]"
            />
          </div>

          <div className="col-span-2">
            <input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="border rounded-md p-2 w-full h-10"
              placeholder="Invoice / Order"
            />
          </div>

          <div className="col-span-1 flex items-center h-10">
            <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={invoicedFinal}
                onChange={(e) => setInvoicedFinal(e.target.checked)}
              />
              Final
            </label>
          </div>

          <div className="col-span-1 text-right">
  <button
    type="button"
    onClick={createReceipt}
    disabled={saving}
    className="bg-black text-white px-4 py-2 rounded-md h-10 w-full disabled:opacity-50"
  >
    {saving ? "Saving..." : editingReceiptId ? "Save" : "Add"}
  </button>

  {editingReceiptId ? (
    <button
      type="button"
      onClick={() => {
        setEditingReceiptId(null);
        setSelectedMaterialId("");
        setMaterialName("");
        setMaterialSearch("");
        setUnit("yd");
        setUnitLocked(false);
        setQuantity(0);
        setTotalCost(0);
        setDate(new Date().toISOString().slice(0, 10));
        setReferenceNumber("");
        setVendorName("");
        setNotes("");
        setInvoicedFinal(false);
      }}
      className="mt-2 border px-4 py-2 rounded-md h-10 w-full"
    >
      Cancel
    </button>
  ) : null}
</div>
</div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-4">
            <label className="text-xs font-semibold text-gray-600">Vendor</label>
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className="border rounded-md p-2 w-full h-10"
              placeholder="Optional vendor"
            />
          </div>

          <div className="col-span-8">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border rounded-md p-2 w-full h-10"
              placeholder="Optional notes"
            />
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Inventory Summary</h2>
          <div className="text-sm text-gray-500">
            Current on-hand position for {activeDivision?.name || "selected division"}
          </div>
        </div>

        <div className="w-full max-w-sm">
          <label className="text-xs font-semibold text-gray-600">Search</label>
          <input
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="border rounded-md p-2 w-full h-10"
            placeholder="Search summary and ledger"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="py-3 px-3">Material</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Qty On Hand</th>
                <th className="py-3 px-3">Avg Cost</th>
                <th className="py-3 px-3">Inventory Value</th>
              </tr>
            </thead>

            <tbody>
              {filteredSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 px-3 text-gray-500">
                    No inventory summary rows found.
                  </td>
                </tr>
              ) : (
                filteredSummary.map((row) => (
                  <tr
                    key={`${row.material_id}_${row.location_id || "none"}`}
                    className={`border-b ${row.negative_flag ? "bg-red-50" : ""}`}
                  >
                    <td className="py-3 px-3 font-medium">{row.material_name}</td>
                    <td className="py-3 px-3">{row.location_name || "—"}</td>
                    <td className="py-3 px-3">
                      <span>
                        {fmtQty(row.qty_on_hand)} {row.inventory_unit || ""}
                      </span>
                      {row.negative_flag ? (
                        <span className="text-red-600 text-xs font-semibold ml-2">LOW</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-3">{money(row.avg_unit_cost)}</td>
                    <td className="py-3 px-3 font-semibold">{money(row.inventory_value)}</td>
                  </tr>
                ))
              )}
            </tbody>

            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td className="py-3 px-3 font-semibold" colSpan={4}>
                  Total Inventory Value
                </td>
                <td className="py-3 px-3 font-bold">{money(totalInventoryValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Inventory Ledger</h2>
        <div className="text-sm text-gray-500">
          Receipts and usage history for {activeDivision?.name || "selected division"}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm min-w-[1100px] table-fixed">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr className="text-left">
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Material</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Qty</th>
                <th className="py-3 px-3">Unit Cost</th>
                <th className="py-3 px-3">Total</th>
                <th className="py-3 px-3">Vendor</th>
                <th className="py-3 px-3">Reference</th>
                <th className="py-3 px-0 text-center w-[70px]">Final</th>
                <th className="py-3 px-3">Notes</th>
                <th className="py-3 px-3">Actions</th>
              </tr>
            </thead>

            <tbody>
  {filteredLedger.length === 0 ? (
    <tr>
      <td colSpan={11} className="py-6 px-3 text-gray-500">
        No inventory ledger rows found.
      </td>
    </tr>
  ) : (
    filteredLedger.map((row) => {
      const materialText =
        row.materials?.display_name || row.materials?.name || "—";
      const rowUnit = row.materials?.inventory_unit || "—";

      return (
        <tr key={row.id} className="border-b">
          <td className="py-3 px-3">
            {formatDateOnly(row.transaction_date)}
          </td>

          <td className="py-3 px-3 font-medium">{materialText}</td>

          <td className="py-3 px-3">
            {titleizeTransactionType(row.transaction_type)}
          </td>

          <td className="py-3 px-3">
            {fmtQty(row.quantity)} {rowUnit}
          </td>

          <td className="py-3 px-3">
            {row.unit_cost !== null ? money(row.unit_cost) : "—"}
          </td>

          <td className="py-3 px-3">
            {row.total_cost !== null ? money(row.total_cost) : "—"}
          </td>

          <td className="py-3 px-3">{row.vendor_name || "—"}</td>

          <td className="py-3 px-3">{row.reference_number || "—"}</td>

          <td className="py-3 px-0 text-center w-[70px]">
  {row.invoiced_final ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-600 text-white text-xs font-bold">
      ✓
    </span>
  ) : (
    <span className="text-gray-300">—</span>
  )}
</td>
          <td className="py-3 px-3 text-center w-[70px]">
  {row.notes ? (
    <div className="group relative flex justify-center">
      <svg
        className="w-4 h-4 text-gray-500 cursor-pointer"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M8 10h8M8 14h6M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>

      {/* Tooltip */}
      <div className="absolute bottom-full mb-2 hidden group-hover:block z-20">
        <div className="bg-gray-900 text-white text-xs rounded px-3 py-2 max-w-[250px] shadow-lg">
          {row.notes}
        </div>
      </div>
    </div>
  ) : (
    <span className="text-gray-300">—</span>
  )}
</td>

          <td className="py-3 px-3 space-x-3">
            {!row.invoiced_final && (
              <button
                type="button"
                onClick={() => startEditReceipt(row)}
                className="text-blue-600 hover:underline font-medium"
              >
                Edit
              </button>
            )}

            <button
              type="button"
              onClick={() => {
  setVoidTargetId(row.id);
  setShowVoidConfirm(true);
}}
              className="text-red-600 hover:underline font-medium"
            >
              Void
            </button>
          </td>
        </tr>
      );
    })
  )}
</tbody>
          </table>
        </div>
      </div>

            {loading ? (
        <div className="text-sm text-gray-500">Loading inventory...</div>
      ) : null}

      {showVoidConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[420px]">
            <div className="text-lg font-semibold mb-2">
              Void Inventory Transaction
            </div>

            <div className="text-sm text-gray-600 mb-4">
              Are you sure you want to void this transaction?
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowVoidConfirm(false);
                  setVoidTargetId(null);
                }}
                className="border px-4 py-2 rounded-md"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  if (voidTargetId) voidReceipt(voidTargetId);
                  setShowVoidConfirm(false);
                  setVoidTargetId(null);
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-md"
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
