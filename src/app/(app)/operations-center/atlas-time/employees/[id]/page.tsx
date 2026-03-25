"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2";

type Department = { id: string; name: string };
type Division = { id: string; name: string; active: boolean; time_clock_only: boolean };
type DivisionLink = { id: string; division_id: string; is_primary: boolean; at_divisions: { id: string; name: string } | null };
type PayRate = { id: string; label: string; rate: number; effective_date: string; end_date: string | null; is_default: boolean };
type Employee = Record<string, any>;
type UniformItem = { key: string; item: string; qty: number; issued_date: string; returned: boolean };

const T_SHIRT_SIZES = ["XS","S","M","L","XL","2XL","3XL","4XL"];
const JACKET_SIZES = ["XS","S","M","L","XL","2XL","3XL","4XL"];
const COMMON_ITEMS = ["T-Shirt","Polo","Work Pants","Shorts","Hoodie","Work Jacket","Rain Jacket","Rain Pants","Safety Vest","Baseball Cap","Hi-Vis Vest","Gloves","Work Boots"];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  terminated: "bg-red-50 text-red-700",
  on_leave: "bg-amber-50 text-amber-700",
};

function Section({ title, children, action, desc }: { title: string; children: React.ReactNode; action?: React.ReactNode; desc?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-[#123b1f]" : "bg-gray-200"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionLinks, setDivisionLinks] = useState<DivisionLink[]>([]);
  const [payRates, setPayRates] = useState<PayRate[]>([]);
  const [form, setForm] = useState<Employee>({});
  const [addingDivision, setAddingDivision] = useState(false);
  const [newDivisionId, setNewDivisionId] = useState("");

  // Uniform items state
  const [uniformItems, setUniformItems] = useState<UniformItem[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemDate, setNewItemDate] = useState(new Date().toISOString().slice(0, 10));

  // Pay rate form
  const [addingRate, setAddingRate] = useState(false);
  const [newRateLabel, setNewRateLabel] = useState("");
  const [newRateAmount, setNewRateAmount] = useState("");
  const [newRateDate, setNewRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRateDefault, setNewRateDefault] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);

  // Termination
  const [showTerminate, setShowTerminate] = useState(false);

  function set(key: string, value: any) {
    setForm((prev: Employee) => ({ ...prev, [key]: value }));
  }

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [empRes, deptRes, divRes] = await Promise.all([
        fetch(`/api/atlas-time/employees/${id}`, { cache: "no-store" }),
        fetch("/api/atlas-time/departments", { cache: "no-store" }),
        fetch("/api/atlas-time/divisions", { cache: "no-store" }),
      ]);
      const empJson = await empRes.json().catch(() => null);
      const deptJson = await deptRes.json().catch(() => null);
      const divJson = await divRes.json().catch(() => null);
      if (!empRes.ok) throw new Error(empJson?.error ?? "Team member not found");
      setForm(empJson.employee ?? {});
      setPayRates(empJson.pay_rates ?? []);
      setDivisionLinks(empJson.division_links ?? []);
      setDepartments(deptJson?.departments ?? []);
      setDivisions((divJson?.divisions ?? []).filter((d: Division) => d.active));

      // Parse uniform items
      const raw = empJson.employee?.uniform_items;
      if (Array.isArray(raw)) setUniformItems(raw);
      else setUniformItems([]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch(`/api/atlas-time/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, uniform_items: uniformItems }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      setSuccess("Saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── Uniform items ──────────────────────────────────────
  function addUniformItem() {
    if (!newItemName.trim()) return;
    setUniformItems(prev => [...prev, {
      key: `${Date.now()}`,
      item: newItemName.trim(),
      qty: Math.max(1, parseInt(newItemQty) || 1),
      issued_date: newItemDate,
      returned: false,
    }]);
    setNewItemName(""); setNewItemQty("1"); setAddingItem(false);
  }

  function updateUniformItem(key: string, patch: Partial<UniformItem>) {
    setUniformItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));
  }

  function removeUniformItem(key: string) {
    setUniformItems(prev => prev.filter(i => i.key !== key));
  }

  // ── Pay rates ──────────────────────────────────────────
  async function addPayRate() {
    if (!newRateLabel.trim() || !newRateAmount) return;
    try {
      setRateSaving(true);
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newRateLabel.trim(), rate: Number(newRateAmount), effective_date: newRateDate, is_default: newRateDefault }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to add rate");
      if (newRateDefault) {
        setPayRates(prev => prev.map(r => ({ ...r, is_default: false })).concat(json.pay_rate));
      } else {
        setPayRates(prev => [...prev, json.pay_rate]);
      }
      setAddingRate(false); setNewRateLabel(""); setNewRateAmount(""); setNewRateDefault(false);
    } catch (e: any) { setError(e?.message ?? "Failed to add rate"); }
    finally { setRateSaving(false); }
  }

  async function deletePayRate(rateId: string) {
    if (!confirm("Remove this pay rate?")) return;
    const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates?rate_id=${rateId}`, { method: "DELETE" });
    if (res.ok) setPayRates(prev => prev.filter(r => r.id !== rateId));
    else { const j = await res.json().catch(() => null); setError(j?.error ?? "Failed"); }
  }

  // ── Termination ────────────────────────────────────────
  async function terminate() {
    if (!form.termination_date) { setError("Termination date is required."); return; }
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "terminated",
          termination_date: form.termination_date,
          termination_reason: form.termination_reason,
          termination_notes: form.termination_notes,
          final_check_issued: form.final_check_issued ?? false,
          final_check_date: form.final_check_date,
          equipment_returned: form.equipment_returned ?? false,
          access_revoked_at: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to terminate");
      setForm((prev: Employee) => ({ ...prev, status: "terminated" }));
      setShowTerminate(false);
      setSuccess("Team member terminated.");
    } catch (e: any) { setError(e?.message ?? "Failed to terminate"); }
    finally { setSaving(false); }
  }

  useEffect(() => { load(); }, [id]);

  const mi = form.middle_initial ? ` ${form.middle_initial}.` : "";
  const fullName = form.first_name
    ? `${form.last_name}, ${form.first_name}${mi}`
    : "Team Member";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas HR</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time/employees" className="hover:text-white/80 transition-colors">Team Members</Link>
            <span>/</span>
            <span className="text-white/80 truncate">{fullName}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex-1 truncate">{fullName}</h1>
            {form.status && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-500"}`}>
                {form.status.charAt(0).toUpperCase() + form.status.slice(1).replace("_", " ")}
              </span>
            )}
          </div>
          {form.hire_date && (
            <p className="text-white/50 text-sm mt-1">
              Hired {new Date(form.hire_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {form.job_title && ` · ${form.job_title}`}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {success}
          </div>
        )}

        {/* Name */}
        <Section title="Name & Identity">
          <div className="grid grid-cols-[1fr_80px_1fr] gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input value={form.first_name ?? ""} onChange={e => set("first_name", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>M.I.</label>
              <input value={form.middle_initial ?? ""} onChange={e => set("middle_initial", e.target.value)} className={inputCls} maxLength={3} placeholder="A" />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={form.last_name ?? ""} onChange={e => set("last_name", e.target.value)} className={inputCls} />
            </div>
          </div>
          <TwoCol>
            <div>
              <label className={labelCls}>Preferred / Nickname</label>
              <input value={form.preferred_name ?? ""} onChange={e => set("preferred_name", e.target.value)} className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.date_of_birth ?? ""} onChange={e => set("date_of_birth", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
        </Section>

        {/* Employment */}
        <Section title="Employment">
          <TwoCol>
            <div>
              <label className={labelCls}>Hire Date</label>
              <input type="date" value={form.hire_date ?? ""} onChange={e => set("hire_date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>1st Working Day</label>
              <input type="date" value={form.first_working_day ?? ""} onChange={e => set("first_working_day", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Job Title</label>
              <input value={form.job_title ?? ""} onChange={e => set("job_title", e.target.value)} className={inputCls} placeholder="e.g. Crew Leader" />
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <select value={form.department_id ?? ""} onChange={e => set("department_id", e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </TwoCol>

          {/* Multiple divisions */}
          <div>
            <label className={labelCls}>Divisions</label>
            {divisionLinks.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {divisionLinks.map(link => (
                  <div key={link.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                    <span className="flex-1 text-sm text-gray-800">{link.at_divisions?.name ?? "Unknown"}</span>
                    {link.is_primary && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Primary</span>
                    )}
                    {!link.is_primary && (
                      <button
                        onClick={async () => {
                          const r = await fetch(`/api/atlas-time/employees/${id}/divisions`, {
                            method: "PATCH", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ link_id: link.id }),
                          });
                          if (r.ok) setDivisionLinks(prev => prev.map(l => ({ ...l, is_primary: l.id === link.id })));
                        }}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const r = await fetch(`/api/atlas-time/employees/${id}/divisions?link_id=${link.id}`, { method: "DELETE" });
                        if (r.ok) setDivisionLinks(prev => prev.filter(l => l.id !== link.id));
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {addingDivision ? (
              <div className="flex gap-2">
                <select
                  autoFocus
                  value={newDivisionId}
                  onChange={e => setNewDivisionId(e.target.value)}
                  className={inputCls + " flex-1"}
                >
                  <option value="">— Select division —</option>
                  {divisions
                    .filter(d => !divisionLinks.some(l => l.division_id === d.id))
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}{d.time_clock_only ? " (Time Clock)" : ""}</option>
                    ))}
                </select>
                <button
                  onClick={async () => {
                    if (!newDivisionId) return;
                    const isPrimary = divisionLinks.length === 0;
                    const r = await fetch(`/api/atlas-time/employees/${id}/divisions`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ division_id: newDivisionId, is_primary: isPrimary }),
                    });
                    const j = await r.json();
                    if (r.ok) { setDivisionLinks(prev => isPrimary ? [...prev.map(l => ({ ...l, is_primary: false })), j] : [...prev, j]); }
                    else setError(j?.error ?? "Failed to add division");
                    setAddingDivision(false); setNewDivisionId("");
                  }}
                  className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-2 rounded-xl hover:bg-[#1a5c2e]"
                >Add</button>
                <button onClick={() => { setAddingDivision(false); setNewDivisionId(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingDivision(true)}
                className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] flex items-center gap-1 transition-colors mt-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Division
              </button>
            )}
          </div>
          <TwoCol>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status ?? "active"} onChange={e => set("status", e.target.value)} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Pay Type</label>
              <select value={form.pay_type ?? "hourly"} onChange={e => set("pay_type", e.target.value)} className={inputCls}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salaried (OT eligible)</option>
                <option value="exempt_salary">Salaried Exempt</option>
              </select>
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Default {form.pay_type === "hourly" ? "Hourly Rate" : "Annual Salary"}</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                <input type="number" min={0} step={0.01}
                  value={form.default_pay_rate ?? ""}
                  onChange={e => set("default_pay_rate", e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls + " pl-7"} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Anniversary Note</label>
              <input value={form.anniversary_note ?? ""} onChange={e => set("anniversary_note", e.target.value)} className={inputCls} placeholder="e.g. 5-year milestone in June" />
            </div>
          </TwoCol>
        </Section>

        {/* Pay Rates */}
        <Section title="Pay Rates"
          action={
            <button onClick={() => setAddingRate(true)}
              className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1 shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Rate
            </button>
          }
        >
          {payRates.length === 0 && !addingRate && (
            <p className="text-sm text-gray-400">No pay rates on file. The default rate above is used for payroll.</p>
          )}
          {payRates.length > 0 && (
            <div className="space-y-2">
              {payRates.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{r.label}</span>
                      {r.is_default && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Default</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      Effective {new Date(r.effective_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {r.end_date && ` → ${new Date(r.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-800">${Number(r.rate).toFixed(2)}<span className="text-xs text-gray-400 font-normal">/hr</span></span>
                  <button onClick={() => deletePayRate(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {addingRate && (
            <div className="border border-green-200 bg-green-50/40 rounded-xl p-4 space-y-3">
              <TwoCol>
                <div>
                  <label className={labelCls}>Label</label>
                  <input autoFocus value={newRateLabel} onChange={e => setNewRateLabel(e.target.value)} className={inputCls} placeholder="e.g. Snow Removal" />
                </div>
                <div>
                  <label className={labelCls}>Hourly Rate</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                    <input type="number" min={0} step={0.01} value={newRateAmount} onChange={e => setNewRateAmount(e.target.value)} className={inputCls + " pl-7"} placeholder="0.00" />
                  </div>
                </div>
              </TwoCol>
              <TwoCol>
                <div>
                  <label className={labelCls}>Effective Date</label>
                  <input type="date" value={newRateDate} onChange={e => setNewRateDate(e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Toggle checked={newRateDefault} onChange={setNewRateDefault} />
                  <span className="text-xs text-gray-600 font-medium">Set as default rate</span>
                </div>
              </TwoCol>
              <div className="flex gap-2">
                <button onClick={addPayRate} disabled={rateSaving || !newRateLabel.trim() || !newRateAmount}
                  className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                  {rateSaving ? "Saving…" : "Add Rate"}
                </button>
                <button onClick={() => { setAddingRate(false); setNewRateLabel(""); setNewRateAmount(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
              </div>
            </div>
          )}
          <p className={descCls + " !mb-0"}>Multiple rates support weighted OT calculation (FLSA) for team members who work across different pay grades in the same week.</p>
        </Section>

        {/* Contact */}
        <Section title="Contact Information">
          <TwoCol>
            <div>
              <label className={labelCls}>Mobile Phone</label>
              <input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Personal Email</label>
              <input type="email" value={form.personal_email ?? ""} onChange={e => set("personal_email", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Address</label>
            <input value={form.address_line1 ?? ""} onChange={e => set("address_line1", e.target.value)} className={inputCls + " mb-2"} placeholder="Street address" />
            <input value={form.address_line2 ?? ""} onChange={e => set("address_line2", e.target.value)} className={inputCls} placeholder="Apt, suite, etc." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={labelCls}>City</label>
              <input value={form.city ?? ""} onChange={e => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={form.state ?? ""} onChange={e => set("state", e.target.value)} className={inputCls} maxLength={2} />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input value={form.zip ?? ""} onChange={e => set("zip", e.target.value)} className={inputCls} />
            </div>
          </div>
        </Section>

        {/* Emergency Contact */}
        <Section title="Emergency Contact">
          <TwoCol>
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={form.emergency_contact_name ?? ""} onChange={e => set("emergency_contact_name", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.emergency_contact_phone ?? ""} onChange={e => set("emergency_contact_phone", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
        </Section>

        {/* Certifications & Licensing */}
        <Section title="Certifications & Licensing">
          <TwoCol>
            <div>
              <label className={labelCls}>CPR Expiration</label>
              <input type="date" value={form.cpr_expiration ?? ""} onChange={e => set("cpr_expiration", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>First Aid Expiration</label>
              <input type="date" value={form.first_aid_expiration ?? ""} onChange={e => set("first_aid_expiration", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>DOT Card Expiration</label>
              <input type="date" value={form.dot_card_expiration ?? ""} onChange={e => set("dot_card_expiration", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fert License Expiration</label>
              <input type="date" value={form.fert_license_expiration ?? ""} onChange={e => set("fert_license_expiration", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <div className="flex items-center gap-3 pt-1">
            <Toggle checked={!!form.is_driver} onChange={v => set("is_driver", v)} />
            <span className="text-sm text-gray-700 font-medium">Licensed Driver</span>
          </div>
          {form.is_driver && (
            <TwoCol>
              <div>
                <label className={labelCls}>License Type</label>
                <input value={form.license_type ?? ""} onChange={e => set("license_type", e.target.value)} className={inputCls} placeholder="e.g. CDL-A, Standard" />
              </div>
              <div>
                <label className={labelCls}>License #</label>
                <input value={form.drivers_license_number ?? ""} onChange={e => set("drivers_license_number", e.target.value)} className={inputCls} />
              </div>
            </TwoCol>
          )}
          {form.is_driver && (
            <TwoCol>
              <div>
                <label className={labelCls}>License Expiration</label>
                <input type="date" value={form.drivers_license_expiration ?? ""} onChange={e => set("drivers_license_expiration", e.target.value)} className={inputCls} />
              </div>
            </TwoCol>
          )}
        </Section>

        {/* Benefits & HR Records */}
        <Section title="Benefits & HR Records">
          <TwoCol>
            <div>
              <label className={labelCls}>Health Care Plan</label>
              <input value={form.health_care_plan ?? ""} onChange={e => set("health_care_plan", e.target.value)} className={inputCls} placeholder="e.g. Blue Cross PPO" />
            </div>
            <div>
              <label className={labelCls}>PTO Plan</label>
              <input value={form.pto_plan ?? ""} onChange={e => set("pto_plan", e.target.value)} className={inputCls} placeholder="e.g. Standard, Senior" />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Electronic Devices</label>
            <input
              value={Array.isArray(form.electronic_devices) ? form.electronic_devices.join(", ") : (form.electronic_devices ?? "")}
              onChange={e => set("electronic_devices", e.target.value ? e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) : [])}
              className={inputCls}
              placeholder="e.g. iPhone, iPad (comma separated)"
            />
            <p className="text-xs text-gray-400 mt-1">Comma-separated list of company devices assigned to this team member.</p>
          </div>
          <TwoCol>
            <div className="flex items-center gap-3">
              <Toggle checked={form.i9_on_file === true} onChange={v => set("i9_on_file", v)} />
              <span className="text-sm text-gray-700 font-medium">I-9 On File</span>
            </div>
            <div>
              <label className={labelCls}>Eligible for Rehire</label>
              <select value={form.eligible_for_rehire === true ? "yes" : form.eligible_for_rehire === false ? "no" : ""}
                onChange={e => set("eligible_for_rehire", e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}
                className={inputCls}>
                <option value="">— Not set —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </TwoCol>
        </Section>

        {/* Uniform & HR */}
        <Section title="Uniform & Gear" desc="Sizes, issued items, and return tracking.">
          {/* Sizes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sizes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>T-Shirt</label>
                <select value={form.t_shirt_size ?? ""} onChange={e => set("t_shirt_size", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {T_SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Jacket / Hoodie</label>
                <select value={form.jacket_size ?? ""} onChange={e => set("jacket_size", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {JACKET_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Pants / Shorts</label>
                <input value={form.pants_size ?? ""} onChange={e => set("pants_size", e.target.value)} className={inputCls} placeholder="e.g. 32×30" />
              </div>
              <div>
                <label className={labelCls}>Hat / Cap</label>
                <input value={form.hat_size ?? ""} onChange={e => set("hat_size", e.target.value)} className={inputCls} placeholder="e.g. S/M or 7¼" />
              </div>
              <div>
                <label className={labelCls}>Boot / Shoe</label>
                <input value={form.boot_size ?? ""} onChange={e => set("boot_size", e.target.value)} className={inputCls} placeholder="e.g. 10.5W" />
              </div>
            </div>
          </div>

          {/* Issued items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Issued Items</p>
              <button onClick={() => setAddingItem(true)}
                className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] flex items-center gap-1 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Item
              </button>
            </div>

            {uniformItems.length === 0 && !addingItem && (
              <p className="text-xs text-gray-400 py-1">No items issued yet.</p>
            )}

            {uniformItems.length > 0 && (
              <div className="space-y-2 mb-3">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_56px_130px_80px_32px] gap-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <span>Item</span><span className="text-center">Qty</span><span>Issued</span><span className="text-center">Returned</span><span />
                </div>
                {uniformItems.map(item => (
                  <div key={item.key} className="grid grid-cols-[1fr_56px_130px_80px_32px] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2">
                    <span className={`text-sm font-medium ${item.returned ? "line-through text-gray-400" : "text-gray-800"}`}>{item.item}</span>
                    <input
                      type="number" min={1}
                      value={item.qty}
                      onChange={e => updateUniformItem(item.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <input
                      type="date"
                      value={item.issued_date}
                      onChange={e => updateUniformItem(item.key, { issued_date: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <div className="flex justify-center">
                      <button
                        onClick={() => updateUniformItem(item.key, { returned: !item.returned })}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.returned ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}
                      >
                        {item.returned && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    <button onClick={() => removeUniformItem(item.key)}
                      className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors flex items-center justify-center">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {addingItem && (
              <div className="border border-green-200 bg-green-50/40 rounded-xl p-3 space-y-3">
                <div>
                  <label className={labelCls}>Item</label>
                  <input
                    autoFocus
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    list="uniform-item-suggestions"
                    className={inputCls}
                    placeholder="e.g. T-Shirt, Rain Jacket…"
                  />
                  <datalist id="uniform-item-suggestions">
                    {COMMON_ITEMS.map(i => <option key={i} value={i} />)}
                  </datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Qty Issued</label>
                    <input type="number" min={1} value={newItemQty} onChange={e => setNewItemQty(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Issue Date</label>
                    <input type="date" value={newItemDate} onChange={e => setNewItemDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addUniformItem} disabled={!newItemName.trim()}
                    className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                    Add Item
                  </button>
                  <button onClick={() => { setAddingItem(false); setNewItemName(""); setNewItemQty("1"); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Issued date + notes */}
          <TwoCol>
            <div>
              <label className={labelCls}>Uniform Kit Issued Date</label>
              <p className={descCls}>Date the full uniform kit was first issued.</p>
              <input type="date" value={form.uniform_issued_date ?? ""} onChange={e => set("uniform_issued_date", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Uniform Notes</label>
            <textarea
              value={form.uniform_notes ?? ""}
              onChange={e => set("uniform_notes", e.target.value)}
              rows={2}
              className={inputCls + " resize-none"}
              placeholder="Special fit notes, alterations, missing items…"
            />
          </div>
        </Section>

        {/* HR Notes */}
        <Section title="HR Notes">
          <textarea
            value={form.notes ?? ""}
            onChange={e => set("notes", e.target.value)}
            rows={3}
            className={inputCls + " resize-none"}
            placeholder="Internal notes…"
          />
        </Section>

        {/* Termination */}
        {form.status !== "terminated" && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-red-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">Termination</h2>
              <button onClick={() => setShowTerminate(!showTerminate)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
                {showTerminate ? "Hide" : "Terminate Team Member"}
              </button>
            </div>
            {showTerminate && (
              <div className="px-5 py-4 space-y-4">
                <TwoCol>
                  <div>
                    <label className={labelCls}>Termination Date *</label>
                    <input type="date" value={form.termination_date ?? ""} onChange={e => set("termination_date", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Reason</label>
                    <select value={form.termination_reason ?? ""} onChange={e => set("termination_reason", e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      <option value="voluntary">Voluntary resignation</option>
                      <option value="involuntary">Involuntary / let go</option>
                      <option value="layoff">Layoff / seasonal end</option>
                      <option value="no_show">Job abandonment</option>
                      <option value="contract_end">Contract end</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </TwoCol>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea value={form.termination_notes ?? ""} onChange={e => set("termination_notes", e.target.value)} rows={2} className={inputCls + " resize-none"} placeholder="Optional notes…" />
                </div>
                <TwoCol>
                  <div className="flex items-center gap-3">
                    <Toggle checked={form.final_check_issued ?? false} onChange={v => set("final_check_issued", v)} />
                    <span className="text-sm text-gray-700">Final paycheck issued</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle checked={form.equipment_returned ?? false} onChange={v => set("equipment_returned", v)} />
                    <span className="text-sm text-gray-700">Equipment returned</span>
                  </div>
                </TwoCol>
                {form.final_check_issued && (
                  <div>
                    <label className={labelCls}>Final Check Date</label>
                    <input type="date" value={form.final_check_date ?? ""} onChange={e => set("final_check_date", e.target.value)} className={inputCls} />
                  </div>
                )}
                <button onClick={terminate} disabled={saving}
                  className="bg-red-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors text-sm">
                  {saving ? "Processing…" : "Confirm Termination"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pb-6">
          <button onClick={save} disabled={saving}
            className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm">
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <Link href="/operations-center/atlas-time/employees"
            className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm">
            Back to Team Members
          </Link>
        </div>
      </div>
    </div>
  );
}
