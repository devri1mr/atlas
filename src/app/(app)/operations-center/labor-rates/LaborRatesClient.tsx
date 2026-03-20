// src/app/operations-center/labor-rates/LaborRatesClient.tsx
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X, Trash2, RefreshCw, Check } from "lucide-react";

type Division = { id: string; name: string };

type DivisionRateRow = {
  division_id: string;
  hourly_rate: number;
  updated_at?: string;
};

type ApiGetResponse = {
  rates: DivisionRateRow[];
  divisions: Division[];
};

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

type Toast = {
  id: string;
  kind: "success" | "error";
  title: string;
  detail?: string;
};

export default function LaborRatesClient() {
  const [loading, setLoading] = React.useState(false);
  const [rates, setRates] = React.useState<DivisionRateRow[]>([]);
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [q, setQ] = React.useState("");

  // per-row drafts (spreadsheet feel)
  const [draftRate, setDraftRate] = React.useState<Record<string, string>>({});
  const [savingDivisionId, setSavingDivisionId] = React.useState<string | null>(
    null
  );

  // add modal
  const [addOpen, setAddOpen] = React.useState(false);
  const [newDivisionId, setNewDivisionId] = React.useState<string>("");
  const [newRate, setNewRate] = React.useState<string>("");

  // delete modal
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DivisionRateRow | null>(
    null
  );
  const [deleting, setDeleting] = React.useState(false);

  const [toast, setToast] = React.useState<Toast | null>(null);

  const divisionName = React.useMemo(() => {
    const map = new Map<string, string>();
    divisions.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [divisions]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/labor-rates", { cache: "no-store" });
      const json = (await res.json()) as ApiGetResponse;

      if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);

      setRates(Array.isArray(json.rates) ? json.rates : []);
      setDivisions(Array.isArray(json.divisions) ? json.divisions : []);
    } catch (e: any) {
      setToast({
        id: crypto.randomUUID(),
        kind: "error",
        title: "Load failed",
        detail: e?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rates;

    return rates.filter((r) => {
      const dName = divisionName.get(r.division_id) ?? "";
      const rateStr = r.hourly_rate != null ? String(r.hourly_rate) : "";
      return (
        dName.toLowerCase().includes(query) ||
        rateStr.toLowerCase().includes(query)
      );
    });
  }, [q, rates, divisionName]);

  function isRowEdited(row: DivisionRateRow) {
    const draft = draftRate[row.division_id];
    return (
      draft !== undefined && toNumber(draft) !== (Number(row.hourly_rate) || 0)
    );
  }

  async function saveRow(row: DivisionRateRow) {
    const division_id = row.division_id;
    setSavingDivisionId(division_id);

    try {
      const rateDraft = draftRate[division_id];
      const hourly_rate =
        rateDraft !== undefined ? toNumber(rateDraft) : Number(row.hourly_rate);

      const res = await fetch("/api/labor-rates", {
        method: "PATCH", // API accepts PATCH (upsert)
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id, hourly_rate }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const updated: DivisionRateRow = data.rate;

      setRates((prev) =>
        prev.map((r) => (r.division_id === division_id ? updated : r))
      );
      setToast({ id: crypto.randomUUID(), kind: "success", title: "Saved" });

      // clear draft for that division
      setDraftRate((prev) => {
        const copy = { ...prev };
        delete copy[division_id];
        return copy;
      });
    } catch (e: any) {
      setToast({
        id: crypto.randomUUID(),
        kind: "error",
        title: "Save failed",
        detail: e?.message,
      });
    } finally {
      setSavingDivisionId(null);
    }
  }

  async function createRow() {
    if (!newDivisionId) {
      setToast({
        id: crypto.randomUUID(),
        kind: "error",
        title: "Select a division",
      });
      return;
    }

    const hourly_rate = toNumber(newRate);

    try {
      const res = await fetch("/api/labor-rates", {
        method: "POST", // API upserts by division_id
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id: newDivisionId, hourly_rate }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (data?.rate) {
        const rate: DivisionRateRow = data.rate;

        setRates((prev) => {
          const exists = prev.some((r) => r.division_id === rate.division_id);
          if (exists) return prev.map((r) => (r.division_id === rate.division_id ? rate : r));
          return [rate, ...prev];
        });
      } else {
        await load();
      }

      setToast({
        id: crypto.randomUUID(),
        kind: "success",
        title: "Added",
        detail: "Division rate saved.",
      });

      setAddOpen(false);
      setNewDivisionId("");
      setNewRate("");
    } catch (e: any) {
      setToast({
        id: crypto.randomUUID(),
        kind: "error",
        title: "Add failed",
        detail: e?.message,
      });
    }
  }

  function openDelete(row: DivisionRateRow) {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const res = await fetch("/api/labor-rates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id: deleteTarget.division_id }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setRates((prev) =>
        prev.filter((r) => r.division_id !== deleteTarget.division_id)
      );

      setToast({ id: crypto.randomUUID(), kind: "success", title: "Deleted" });

      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setToast({
        id: crypto.randomUUID(),
        kind: "error",
        title: "Delete failed",
        detail: e?.message,
      });
    } finally {
      setDeleting(false);
    }
  }

  // For the add dropdown: only show divisions that do NOT already have a rate row
  const divisionsWithoutRate = React.useMemo(() => {
    const existing = new Set(rates.map((r) => r.division_id));
    return divisions.filter((d) => !existing.has(d.id));
  }, [divisions, rates]);

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
              <span>Operations Center</span>
              <span>/</span>
              <span className="text-white/80">Labor Rates</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Labor Rates</h1>
            <p className="text-white/50 text-sm mt-1">One hourly rate per division — used for both labor and trucking cost calculations.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
              <Dialog.Trigger asChild>
                <button className="inline-flex items-center gap-2 rounded-xl bg-white/15 border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/25 transition-colors">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Rate</span>
                </button>
              </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[99999] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl focus:outline-none">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-slate-900">
                      Add division rate
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-600">
                      Choose a division, then set the hourly rate.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Division
                    </label>
                    <select
                      value={newDivisionId}
                      onChange={(e) => setNewDivisionId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Select…</option>
                      {divisionsWithoutRate.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    {divisionsWithoutRate.length === 0 ? (
                      <div className="mt-1 text-xs text-slate-500">
                        All divisions already have a rate. Edit an existing row instead.
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Hourly rate
                    </label>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="text-slate-500">$</span>
                      <input
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        inputMode="decimal"
                        className="w-full text-sm outline-none"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Preview: {money(toNumber(newRate))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Dialog.Close asChild>
                    <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={createRow}
                    disabled={!newDivisionId}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                      !newDivisionId
                        ? "bg-emerald-300"
                        : "bg-emerald-700 hover:bg-emerald-800"
                    }`}
                  >
                    Add
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-lg">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search division or rate…"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="text-sm text-gray-500 shrink-0">
            {filtered.length} of {rates.length}
          </div>
        </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="hidden md:grid grid-cols-[1.6fr_1fr_220px] gap-0 border-b border-gray-100 bg-gray-50 rounded-t-2xl px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <div>Division</div>
          <div>Hourly Rate</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            No rows found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const divisionId = row.division_id;

              const rateValue =
                draftRate[divisionId] !== undefined
                  ? draftRate[divisionId]
                  : row.hourly_rate != null
                  ? String(row.hourly_rate)
                  : "";

              const edited = isRowEdited(row);

              return (
                <div
                  key={divisionId}
                  className="grid grid-cols-[1.6fr_1fr_220px] items-center gap-0 px-4 py-3"
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold text-gray-900">
                      {divisionName.get(divisionId) ?? "Unknown Division"}
                    </div>
                  </div>

                  <div className="pr-4">
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 bg-white ${edited ? "border-green-300 ring-1 ring-green-200" : "border-gray-200"}`}>
                      <span className="text-gray-400 text-sm font-medium">$</span>
                      <input
                        value={rateValue}
                        onChange={(e) =>
                          setDraftRate((prev) => ({
                            ...prev,
                            [divisionId]: e.target.value,
                          }))
                        }
                        inputMode="decimal"
                        className="w-full text-sm outline-none font-semibold text-gray-800"
                        placeholder="0.00"
                      />
                      {edited && <span className="text-xs font-semibold text-green-600 shrink-0">edited</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={savingDivisionId === divisionId}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        savingDivisionId === divisionId
                          ? "bg-green-100 text-green-800"
                          : "bg-[#123b1f] text-white hover:bg-[#1a5c2e]"
                      }`}
                    >
                      {savingDivisionId === divisionId ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Save
                    </button>

                    <button
                      onClick={() => openDelete(row)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-400 border-t border-gray-50">
          <div>Edit the rate inline → click <span className="font-semibold text-gray-600">Save</span> to apply.</div>
          <div>One rate per division</div>
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[99999] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-slate-900">
                  Delete division rate?
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-slate-600">
                  This cannot be undone.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {deleteTarget ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-900">
                  {divisionName.get(deleteTarget.division_id) ??
                    deleteTarget.division_id}
                </div>
                <div className="text-slate-600">
                  Current rate: {money(Number(deleteTarget.hourly_rate) || 0)}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </Dialog.Close>

              <button
                onClick={confirmDelete}
                disabled={deleting}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  deleting ? "bg-red-300" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-6 right-6 z-[100000] w-[360px] max-w-[90vw] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={`text-sm font-semibold ${
                  toast.kind === "error" ? "text-red-700" : "text-emerald-700"
                }`}
              >
                {toast.title}
              </div>
              {toast.detail ? (
                <div className="mt-1 text-xs text-slate-600">{toast.detail}</div>
              ) : null}
            </div>
            <button
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => setToast(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
