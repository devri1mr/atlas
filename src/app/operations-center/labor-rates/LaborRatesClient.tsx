"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X, Trash2, RefreshCw, Check } from "lucide-react";

type Division = { id: number; name: string };

type LaborRateRow = {
  id: number;
  division_id: number | null;
  job_role_id: number | null; // legacy column (we will ignore it)
  hourly_rate: number | null;
};

type ApiGetResponse = {
  rates: LaborRateRow[];
  divisions: Division[];
  // roles may still exist in API response, but UI no longer uses them
  roles?: any[];
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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type Toast = { id: string; kind: "success" | "error"; title: string; detail?: string };

export default function LaborRatesClient() {
  const [loading, setLoading] = React.useState(false);
  const [rates, setRates] = React.useState<LaborRateRow[]>([]);
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [q, setQ] = React.useState("");

  // per-row drafts (keep spreadsheet feel)
  const [draftRates, setDraftRates] = React.useState<Record<number, string>>({});
  const [draftDivision, setDraftDivision] = React.useState<Record<number, number | "">>({});
  const [savingId, setSavingId] = React.useState<number | null>(null);

  // add modal
  const [addOpen, setAddOpen] = React.useState(false);
  const [newDivisionId, setNewDivisionId] = React.useState<number | "">("");
  const [newRate, setNewRate] = React.useState<string>("");

  // delete modal
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<LaborRateRow | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const [toast, setToast] = React.useState<Toast | null>(null);

  const divisionName = React.useMemo(() => {
    const map = new Map<number, string>();
    divisions.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [divisions]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/labor-rates", { cache: "no-store" });
      const txt = await res.text();
      const json = (txt ? JSON.parse(txt) : {}) as ApiGetResponse;

      if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);

      setRates(Array.isArray(json.rates) ? json.rates : []);
      setDivisions(Array.isArray(json.divisions) ? json.divisions : []);
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Load failed", detail: e?.message });
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
      const dName = r.division_id ? divisionName.get(r.division_id) ?? "" : "";
      const rateStr = r.hourly_rate != null ? String(r.hourly_rate) : "";
      return dName.toLowerCase().includes(query) || rateStr.toLowerCase().includes(query);
    });
  }, [q, rates, divisionName]);

  function isRowEdited(row: LaborRateRow) {
    const id = row.id;
    const rateDraft = draftRates[id];
    const divDraft = draftDivision[id];

    const rateChanged = rateDraft !== undefined && toNumber(rateDraft) !== (row.hourly_rate ?? 0);
    const divChanged = divDraft !== undefined && (divDraft === "" ? null : divDraft) !== row.division_id;

    return rateChanged || divChanged;
  }

  async function saveRow(row: LaborRateRow) {
    const id = row.id;
    setSavingId(id);

    try {
      const payload: any = { id };

      const rateDraft = draftRates[id];
      if (rateDraft !== undefined) payload.hourly_rate = toNumber(rateDraft);

      const divDraft = draftDivision[id];
      if (divDraft !== undefined && divDraft !== "") payload.division_id = divDraft;

      // If user never touched dropdown, preserve existing
      if (payload.division_id === undefined && typeof row.division_id === "number") payload.division_id = row.division_id;

      const res = await fetch("/api/labor-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const updated: LaborRateRow = data.rate;

      setRates((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setToast({ id: crypto.randomUUID(), kind: "success", title: "Saved" });

      // clear drafts for that row
      setDraftRates((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setDraftDivision((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Save failed", detail: e?.message });
    } finally {
      setSavingId(null);
    }
  }

  async function createRow() {
    if (newDivisionId === "") {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Select a division" });
      return;
    }

    const hourly_rate = toNumber(newRate);

    try {
      const res = await fetch("/api/labor-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_id: newDivisionId,
          // IMPORTANT: roles removed — send null for legacy compatibility
          job_role_id: null,
          hourly_rate,
        }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (data?.rate) {
        setRates((prev) => [data.rate as LaborRateRow, ...prev]);
      } else {
        await load(); // safe fallback
      }

      setToast({ id: crypto.randomUUID(), kind: "success", title: "Added", detail: "Division rate created." });

      setAddOpen(false);
      setNewDivisionId("");
      setNewRate("");
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Add failed", detail: e?.message });
    }
  }

  function openDelete(row: LaborRateRow) {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeletingId(id);

    try {
      const res = await fetch("/api/labor-rates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : {};

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setRates((prev) => prev.filter((r) => r.id !== id));
      setToast({ id: crypto.randomUUID(), kind: "success", title: "Deleted" });

      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Delete failed", detail: e?.message });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-[1120px] mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Operations Center</div>
          <h1 className="text-3xl font-semibold text-slate-900">Labor Rates</h1>
          <p className="text-slate-600 mt-1">
            One hourly rate per division. Edit like a spreadsheet. Save per row.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
            <Dialog.Trigger asChild>
              <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800">
                <Plus className="h-4 w-4" />
                Add division rate
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[99999] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl focus:outline-none">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-slate-900">Add division rate</Dialog.Title>
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
                    <label className="text-sm font-medium text-slate-700">Division</label>
                    <select
                      value={newDivisionId}
                      onChange={(e) => setNewDivisionId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Select…</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Hourly rate</label>
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
                    <div className="mt-1 text-xs text-slate-500">Preview: {money(toNumber(newRate))}</div>
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
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                  >
                    Add
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="relative w-full max-w-lg">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search division or rate…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="text-sm text-slate-500">
          {filtered.length} / {rates.length}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1.5fr_1fr_220px] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-600">
          <div>Division</div>
          <div>Hourly Rate</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">No rows found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const id = row.id;

              const divValue =
                draftDivision[id] !== undefined
                  ? draftDivision[id]
                  : typeof row.division_id === "number"
                    ? row.division_id
                    : "";

              const rateValue =
                draftRates[id] !== undefined
                  ? draftRates[id]
                  : row.hourly_rate != null
                    ? String(row.hourly_rate)
                    : "";

              const edited = isRowEdited(row);

              return (
                <div key={id} className="grid grid-cols-[1.5fr_1fr_220px] items-center gap-0 px-4 py-3">
                  <div className="pr-3">
                    <select
                      value={divValue as any}
                      onChange={(e) =>
                        setDraftDivision((prev) => ({
                          ...prev,
                          [id]: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pr-3">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="text-slate-500">$</span>
                      <input
                        value={rateValue}
                        onChange={(e) => setDraftRates((prev) => ({ ...prev, [id]: e.target.value }))}
                        inputMode="decimal"
                        className="w-full text-sm outline-none"
                      />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{money(toNumber(rateValue))}</div>
                    {edited && (
                      <div className="mt-1 inline-flex rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                        Edited
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={savingId === id}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                        savingId === id
                          ? "bg-emerald-200 text-emerald-900"
                          : "bg-emerald-700 text-white hover:bg-emerald-800"
                      }`}
                    >
                      {savingId === id ? (
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

        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
          <div>
            Tip: edit cells → click <b>Save</b> on that row.
          </div>
          <div>One rate per division.</div>
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[99999] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-slate-900">Delete division rate?</Dialog.Title>
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

            <div className="mt-5 flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </Dialog.Close>

              <button
                onClick={confirmDelete}
                disabled={deletingId != null}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  deletingId != null ? "bg-red-300" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {deletingId != null ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast */}
      {toast && (
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
              {toast.detail && <div className="mt-1 text-xs text-slate-600">{toast.detail}</div>}
            </div>
            <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setToast(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
