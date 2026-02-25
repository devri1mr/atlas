"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Plus, RefreshCcw, Search, Trash2, X } from "lucide-react";

type Division = { id: number; name: string };
type Role = { id: number; name: string };

type LaborRateRow = {
  id: number;
  division_id?: number | null;
  division_name?: string | null;
  job_role_id?: number | null;
  role_name?: string | null;
  hourly_rate: number | string | null;
};

type ApiGetResponse =
  | {
      rates: LaborRateRow[];
      divisions?: Division[];
      roles?: Role[];
    }
  | LaborRateRow[]; // tolerate older shape

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function toNumber(input: unknown): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return input;
  const s = String(input).replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number) {
  return money.format(n);
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Toast = { id: string; kind: "success" | "error"; title: string; detail?: string };

export default function LaborRatesClient() {
  const [loading, setLoading] = React.useState(true);
  const [rates, setRates] = React.useState<LaborRateRow[]>([]);
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [query, setQuery] = React.useState("");
  const [savingId, setSavingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  // Track per-row edits (spreadsheet style)
  const [draftRates, setDraftRates] = React.useState<Record<number, string>>({});
  const [draftDivision, setDraftDivision] = React.useState<Record<number, number>>({});
  const [draftRole, setDraftRole] = React.useState<Record<number, number>>({});

  const [toast, setToast] = React.useState<Toast | null>(null);

  // Add modal
  const [addOpen, setAddOpen] = React.useState(false);
  const [newDivisionId, setNewDivisionId] = React.useState<number | "">("");
  const [newRoleId, setNewRoleId] = React.useState<number | "">("");
  const [newRate, setNewRate] = React.useState<string>("");

  // Delete confirm modal
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<LaborRateRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/labor-rates", { cache: "no-store" });
      const json = (await res.json()) as ApiGetResponse;

      const normalized =
        Array.isArray(json)
          ? { rates: json, divisions: [], roles: [] }
          : { rates: json.rates ?? [], divisions: json.divisions ?? [], roles: json.roles ?? [] };

      setRates(normalized.rates);

      // if API provided dimension tables, use them
      if (normalized.divisions?.length) setDivisions(normalized.divisions);
      if (normalized.roles?.length) setRoles(normalized.roles);

      // prime drafts so editing feels instant
      const dr: Record<number, string> = {};
      const dd: Record<number, number> = {};
      const drol: Record<number, number> = {};

      for (const r of normalized.rates) {
        dr[r.id] = String(toNumber(r.hourly_rate));
        if (typeof r.division_id === "number") dd[r.id] = r.division_id;
        if (typeof r.job_role_id === "number") drol[r.id] = r.job_role_id;
      }
      setDraftRates(dr);
      setDraftDivision(dd);
      setDraftRole(drol);
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Failed to load labor rates", detail: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter((r) => {
      const d = (r.division_name ?? "").toLowerCase();
      const role = (r.role_name ?? "").toLowerCase();
      const amt = String(toNumber(r.hourly_rate));
      return d.includes(q) || role.includes(q) || amt.includes(q);
    });
  }, [rates, query]);

  function isDirty(row: LaborRateRow) {
    const id = row.id;
    const rateNow = toNumber(row.hourly_rate);
    const rateDraft = toNumber(draftRates[id] ?? rateNow);
    const divNow = typeof row.division_id === "number" ? row.division_id : undefined;
    const roleNow = typeof row.job_role_id === "number" ? row.job_role_id : undefined;

    const divDraft = draftDivision[id] ?? divNow;
    const roleDraft = draftRole[id] ?? roleNow;

    return rateNow !== rateDraft || divNow !== divDraft || roleNow !== roleDraft;
  }

  async function saveRow(row: LaborRateRow) {
    const id = row.id;
    setSavingId(id);
    try {
      const payload: any = {
        id,
        hourly_rate: toNumber(draftRates[id] ?? row.hourly_rate),
      };

      // only send if we actually have ids to send
      if (typeof (draftDivision[id] ?? row.division_id) === "number") {
        payload.division_id = draftDivision[id] ?? row.division_id;
      }
      if (typeof (draftRole[id] ?? row.job_role_id) === "number") {
        payload.job_role_id = draftRole[id] ?? row.job_role_id;
      }

      const res = await fetch("/api/labor-rates/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      // optimistic update in UI
      setRates((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated: LaborRateRow = {
            ...r,
            hourly_rate: payload.hourly_rate,
            division_id: payload.division_id ?? r.division_id,
            job_role_id: payload.job_role_id ?? r.job_role_id,
            division_name:
              typeof payload.division_id === "number"
                ? divisions.find((d) => d.id === payload.division_id)?.name ?? r.division_name
                : r.division_name,
            role_name:
              typeof payload.job_role_id === "number"
                ? roles.find((x) => x.id === payload.job_role_id)?.name ?? r.role_name
                : r.role_name,
          };
          return updated;
        })
      );

      setToast({ id: crypto.randomUUID(), kind: "success", title: "Saved", detail: "Labor rate updated." });
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Save failed", detail: String(e?.message ?? e) });
    } finally {
      setSavingId(null);
    }
  }

  async function createRow() {
    // we only allow create if we have ids
    if (newDivisionId === "" || newRoleId === "") {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Missing fields", detail: "Pick a Division and Role first." });
      return;
    }

    const hourly_rate = toNumber(newRate);

    try {
      const res = await fetch("/api/labor-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_id: newDivisionId,
          job_role_id: newRoleId,
          hourly_rate,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const created = (await res.json()) as LaborRateRow;

      // Add to list and prime drafts
      setRates((prev) => [created, ...prev]);
      setDraftRates((prev) => ({ ...prev, [created.id]: String(toNumber(created.hourly_rate)) }));
      if (typeof created.division_id === "number") setDraftDivision((p) => ({ ...p, [created.id]: created.division_id! }));
      if (typeof created.job_role_id === "number") setDraftRole((p) => ({ ...p, [created.id]: created.job_role_id! }));

      setAddOpen(false);
      setNewDivisionId("");
      setNewRoleId("");
      setNewRate("");
      setToast({ id: crypto.randomUUID(), kind: "success", title: "Added", detail: "New labor rate created." });
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Add failed", detail: String(e?.message ?? e) });
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
      const res = await fetch(`/api/labor-rates?id=${encodeURIComponent(String(id))}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setRates((prev) => prev.filter((r) => r.id !== id));
      setToast({ id: crypto.randomUUID(), kind: "success", title: "Deleted", detail: "Labor rate removed." });
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setToast({ id: crypto.randomUUID(), kind: "error", title: "Delete failed", detail: String(e?.message ?? e) });
    } finally {
      setDeletingId(null);
    }
  }

  const canCreate = divisions.length > 0 && roles.length > 0;

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-b from-emerald-50/40 to-white">
      {/* Header */}
      <div className="border-b border-emerald-100 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-emerald-700">Operations Center</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Labor Rates</h1>
              <div className="mt-1 text-sm text-slate-600">
                Edit hourly rates like a spreadsheet. Save per row.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => load()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>

              <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
                <Dialog.Trigger asChild>
                  <button
                    className={classNames(
                      "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white",
                      "bg-emerald-600 hover:bg-emerald-700"
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    Add new rate
                  </button>
                </Dialog.Trigger>

                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/40" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-slate-900">Add labor rate</Dialog.Title>
                        <Dialog.Description className="mt-1 text-sm text-slate-600">
                          Choose a division + role, then set an hourly rate.
                        </Dialog.Description>
                      </div>
                      <Dialog.Close asChild>
                        <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
                          <X className="h-4 w-4" />
                        </button>
                      </Dialog.Close>
                    </div>

                    {!canCreate && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Add requires <b>divisions</b> and <b>roles</b> lists returned from <code>/api/labor-rates</code>.
                        Your current API response likely only includes joined names. If you want, I’ll update your route.ts so it returns those lists too.
                      </div>
                    )}

                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-sm font-medium text-slate-700">Division</span>
                        <select
                          disabled={!canCreate}
                          value={newDivisionId}
                          onChange={(e) => setNewDivisionId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
                        >
                          <option value="">Select…</option>
                          {divisions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1">
                        <span className="text-sm font-medium text-slate-700">Role</span>
                        <select
                          disabled={!canCreate}
                          value={newRoleId}
                          onChange={(e) => setNewRoleId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
                        >
                          <option value="">Select…</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1">
                        <span className="text-sm font-medium text-slate-700">Hourly rate</span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                            $
                          </span>
                          <input
                            value={newRate}
                            onChange={(e) => setNewRate(e.target.value)}
                            inputMode="decimal"
                            placeholder="0.00"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </div>
                        <div className="text-xs text-slate-500">Preview: {formatMoney(toNumber(newRate))}</div>
                      </label>
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                      <Dialog.Close asChild>
                        <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Cancel
                        </button>
                      </Dialog.Close>
                      <button
                        onClick={createRow}
                        disabled={!canCreate}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4 flex items-center gap-2">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search division, role, or rate…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="hidden text-sm text-slate-500 md:block">
              {filtered.length} / {rates.length}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-5 py-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Division
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Hourly rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                      No rows found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const dirty = isDirty(row);
                    const divId = draftDivision[row.id] ?? (typeof row.division_id === "number" ? row.division_id : undefined);
                    const roleId = draftRole[row.id] ?? (typeof row.job_role_id === "number" ? row.job_role_id : undefined);

                    return (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        {/* Division */}
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {divisions.length > 0 && typeof divId === "number" ? (
                            <select
                              value={divId}
                              onChange={(e) => setDraftDivision((p) => ({ ...p, [row.id]: Number(e.target.value) }))}
                              className="w-full max-w-xs rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                            >
                              {divisions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <span>{row.division_name ?? "—"}</span>
                              {!divisions.length && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                  read-only
                                </span>
                              )}
                            </span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {roles.length > 0 && typeof roleId === "number" ? (
                            <select
                              value={roleId}
                              onChange={(e) => setDraftRole((p) => ({ ...p, [row.id]: Number(e.target.value) }))}
                              className="w-full max-w-xs rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                            >
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <span>{row.role_name ?? "—"}</span>
                              {!roles.length && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                  read-only
                                </span>
                              )}
                            </span>
                          )}
                        </td>

                        {/* Hourly rate */}
                        <td className="px-4 py-3 text-sm text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="relative w-40">
                              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                                $
                              </span>
                              <input
                                value={draftRates[row.id] ?? String(toNumber(row.hourly_rate))}
                                onChange={(e) => setDraftRates((p) => ({ ...p, [row.id]: e.target.value }))}
                                onBlur={() => {
                                  // normalize on blur
                                  const n = toNumber(draftRates[row.id] ?? row.hourly_rate);
                                  setDraftRates((p) => ({ ...p, [row.id]: n.toFixed(2) }));
                                }}
                                inputMode="decimal"
                                className={classNames(
                                  "w-full rounded-md border bg-white py-1 pl-6 pr-2 text-sm outline-none",
                                  "border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                )}
                              />
                            </div>

                            <span className="text-xs text-slate-500">{formatMoney(toNumber(draftRates[row.id] ?? row.hourly_rate))}</span>

                            {dirty && (
                              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                Edited
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => saveRow(row)}
                              disabled={!dirty || savingId === row.id}
                              className={classNames(
                                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold",
                                dirty
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "bg-slate-100 text-slate-400",
                                (savingId === row.id) && "opacity-70"
                              )}
                            >
                              <Check className="h-4 w-4" />
                              {savingId === row.id ? "Saving…" : "Save"}
                            </button>

                            <button
                              onClick={() => openDelete(row)}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Trash2 className="h-4 w-4 text-slate-500" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/40 px-4 py-3 text-xs text-slate-600">
            <div>
              Tip: edit cells → click <b>Save</b> on that row.
            </div>
            <div className="text-slate-500">
              {divisions.length === 0 || roles.length === 0 ? (
                <span>
                  Add modal is limited until your API returns <code>divisions</code> + <code>roles</code>.
                </span>
              ) : (
                <span>All editing enabled.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-slate-900">Delete labor rate?</Dialog.Title>
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

            {deleteTarget && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                <div><b>Division:</b> {deleteTarget.division_name ?? deleteTarget.division_id ?? "—"}</div>
                <div><b>Role:</b> {deleteTarget.role_name ?? deleteTarget.job_role_id ?? "—"}</div>
                <div><b>Rate:</b> {formatMoney(toNumber(deleteTarget.hourly_rate))}</div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={confirmDelete}
                disabled={deletingId !== null}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId !== null ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-[92vw] max-w-sm">
          <div
            className={classNames(
              "rounded-xl border p-4 shadow-lg",
              toast.kind === "success"
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className={classNames(
                    "text-sm font-semibold",
                    toast.kind === "success" ? "text-emerald-900" : "text-red-900"
                  )}
                >
                  {toast.title}
                </div>
                {toast.detail && (
                  <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{toast.detail}</div>
                )}
              </div>

              <button
                onClick={() => setToast(null)}
                className="rounded-md p-2 text-slate-600 hover:bg-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}