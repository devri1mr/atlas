"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2";

type Department = { id: string; name: string };
type PayRate = { id: string; label: string; rate: number; effective_date: string; end_date: string | null; is_default: boolean };
type Employee = Record<string, any>;

const T_SHIRT_SIZES = ["XS","S","M","L","XL","2XL","3XL","4XL"];
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  terminated: "bg-red-50 text-red-700",
  on_leave: "bg-amber-50 text-amber-700",
};

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
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
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-[#123b1f]" : "bg-gray-200"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [payRates, setPayRates] = useState<PayRate[]>([]);
  const [form, setForm] = useState<Employee>({});

  // Pay rate add form
  const [addingRate, setAddingRate] = useState(false);
  const [newRateLabel, setNewRateLabel] = useState("");
  const [newRateAmount, setNewRateAmount] = useState("");
  const [newRateDate, setNewRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRateDefault, setNewRateDefault] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);

  // Termination panel
  const [showTerminate, setShowTerminate] = useState(false);

  function set(key: string, value: any) {
    setForm((prev: Employee) => ({ ...prev, [key]: value }));
  }

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [empRes, deptRes] = await Promise.all([
        fetch(`/api/atlas-time/employees/${id}`, { cache: "no-store" }),
        fetch("/api/atlas-time/departments", { cache: "no-store" }),
      ]);
      const empJson = await empRes.json().catch(() => null);
      const deptJson = await deptRes.json().catch(() => null);
      if (!empRes.ok) throw new Error(empJson?.error ?? "Employee not found");
      setForm(empJson.employee ?? {});
      setPayRates(empJson.pay_rates ?? []);
      setDepartments(deptJson?.departments ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load employee");
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
        body: JSON.stringify(form),
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

  async function addPayRate() {
    if (!newRateLabel.trim() || !newRateAmount) return;
    try {
      setRateSaving(true);
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newRateLabel.trim(),
          rate: Number(newRateAmount),
          effective_date: newRateDate,
          is_default: newRateDefault,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to add rate");
      if (newRateDefault) {
        setPayRates((prev) => prev.map((r) => ({ ...r, is_default: false })).concat(json.pay_rate));
      } else {
        setPayRates((prev) => [...prev, json.pay_rate]);
      }
      setAddingRate(false);
      setNewRateLabel("");
      setNewRateAmount("");
      setNewRateDefault(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add rate");
    } finally {
      setRateSaving(false);
    }
  }

  async function deletePayRate(rateId: string) {
    if (!confirm("Remove this pay rate?")) return;
    try {
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates?rate_id=${rateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setPayRates((prev) => prev.filter((r) => r.id !== rateId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete rate");
    }
  }

  async function terminate() {
    if (!form.termination_date) { setError("Termination date is required."); return; }
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
      setSuccess("Employee terminated.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to terminate");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const fullName = form.first_name
    ? `${form.first_name}${form.preferred_name ? ` "${form.preferred_name}"` : ""} ${form.last_name}`
    : "Employee";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas Time</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time/employees" className="hover:text-white/80 transition-colors">Employees</Link>
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
          <TwoCol>
            <div>
              <label className={labelCls}>First Name</label>
              <input value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Preferred / Nickname</label>
              <input value={form.preferred_name ?? ""} onChange={(e) => set("preferred_name", e.target.value)} className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
        </Section>

        {/* Employment */}
        <Section title="Employment">
          <TwoCol>
            <div>
              <label className={labelCls}>Hire Date</label>
              <input type="date" value={form.hire_date ?? ""} onChange={(e) => set("hire_date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Job Title</label>
              <input value={form.job_title ?? ""} onChange={(e) => set("job_title", e.target.value)} className={inputCls} placeholder="e.g. Crew Leader" />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Department</label>
              <select value={form.department_id ?? ""} onChange={(e) => set("department_id", e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Pay Type</label>
              <select value={form.pay_type ?? "hourly"} onChange={(e) => set("pay_type", e.target.value)} className={inputCls}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salaried (OT eligible)</option>
                <option value="exempt_salary">Salaried Exempt</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default {form.pay_type === "hourly" ? "Hourly Rate" : "Annual Salary"}</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                <input
                  type="number" min={0} step={0.01}
                  value={form.default_pay_rate ?? ""}
                  onChange={(e) => set("default_pay_rate", e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls + " pl-7"}
                />
              </div>
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Anniversary Note</label>
            <input value={form.anniversary_note ?? ""} onChange={(e) => set("anniversary_note", e.target.value)} className={inputCls} placeholder="e.g. 5-year milestone in June" />
          </div>
        </Section>

        {/* Pay Rates */}
        <Section
          title="Pay Rates"
          action={
            <button
              onClick={() => setAddingRate(true)}
              className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1"
            >
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
              {payRates.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{r.label}</span>
                      {r.is_default && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Default</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      Effective {new Date(r.effective_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {r.end_date && ` → ${new Date(r.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-800">${Number(r.rate).toFixed(2)}<span className="text-xs text-gray-400 font-normal">/hr</span></span>
                  <button
                    onClick={() => deletePayRate(r.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
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
                  <input
                    autoFocus
                    value={newRateLabel}
                    onChange={(e) => setNewRateLabel(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Snow Removal"
                  />
                </div>
                <div>
                  <label className={labelCls}>Hourly Rate</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                    <input
                      type="number" min={0} step={0.01}
                      value={newRateAmount}
                      onChange={(e) => setNewRateAmount(e.target.value)}
                      className={inputCls + " pl-7"}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </TwoCol>
              <TwoCol>
                <div>
                  <label className={labelCls}>Effective Date</label>
                  <input type="date" value={newRateDate} onChange={(e) => setNewRateDate(e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Toggle checked={newRateDefault} onChange={setNewRateDefault} />
                  <span className="text-xs text-gray-600 font-medium">Set as default rate</span>
                </div>
              </TwoCol>
              <div className="flex gap-2">
                <button
                  onClick={addPayRate}
                  disabled={rateSaving || !newRateLabel.trim() || !newRateAmount}
                  className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors"
                >
                  {rateSaving ? "Saving…" : "Add Rate"}
                </button>
                <button
                  onClick={() => { setAddingRate(false); setNewRateLabel(""); setNewRateAmount(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <p className={descCls + " !mb-0"}>Multiple rates support weighted OT calculation (FLSA) for employees who work across different pay grades in the same week.</p>
        </Section>

        {/* Contact */}
        <Section title="Contact Information">
          <TwoCol>
            <div>
              <label className={labelCls}>Mobile Phone</label>
              <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Personal Email</label>
              <input type="email" value={form.personal_email ?? ""} onChange={(e) => set("personal_email", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Address</label>
            <input value={form.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value)} className={inputCls + " mb-2"} placeholder="Street address" />
            <input value={form.address_line2 ?? ""} onChange={(e) => set("address_line2", e.target.value)} className={inputCls} placeholder="Apt, suite, etc." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={labelCls}>City</label>
              <input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} className={inputCls} maxLength={2} />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} className={inputCls} />
            </div>
          </div>
        </Section>

        {/* Emergency Contact */}
        <Section title="Emergency Contact">
          <TwoCol>
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={form.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
        </Section>

        {/* Uniform */}
        <Section title="Uniform & HR">
          <TwoCol>
            <div>
              <label className={labelCls}>T-Shirt Size</label>
              <select value={form.t_shirt_size ?? ""} onChange={(e) => set("t_shirt_size", e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {T_SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Uniform Issued Date</label>
              <input type="date" value={form.uniform_issued_date ?? ""} onChange={(e) => set("uniform_issued_date", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="Internal notes…"
            />
          </div>
        </Section>

        {/* Termination (only if active/on_leave) */}
        {form.status !== "terminated" && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-red-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">Termination</h2>
              <button
                onClick={() => setShowTerminate(!showTerminate)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors"
              >
                {showTerminate ? "Hide" : "Terminate Employee"}
              </button>
            </div>
            {showTerminate && (
              <div className="px-5 py-4 space-y-4">
                <TwoCol>
                  <div>
                    <label className={labelCls}>Termination Date *</label>
                    <input type="date" value={form.termination_date ?? ""} onChange={(e) => set("termination_date", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Reason</label>
                    <select value={form.termination_reason ?? ""} onChange={(e) => set("termination_reason", e.target.value)} className={inputCls}>
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
                  <textarea
                    value={form.termination_notes ?? ""}
                    onChange={(e) => set("termination_notes", e.target.value)}
                    rows={2}
                    className={inputCls + " resize-none"}
                    placeholder="Optional notes about the termination…"
                  />
                </div>
                <TwoCol>
                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={form.final_check_issued ?? false}
                      onChange={(v) => set("final_check_issued", v)}
                    />
                    <span className="text-sm text-gray-700">Final paycheck issued</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={form.equipment_returned ?? false}
                      onChange={(v) => set("equipment_returned", v)}
                    />
                    <span className="text-sm text-gray-700">Equipment returned</span>
                  </div>
                </TwoCol>
                {form.final_check_issued && (
                  <div>
                    <label className={labelCls}>Final Check Date</label>
                    <input type="date" value={form.final_check_date ?? ""} onChange={(e) => set("final_check_date", e.target.value)} className={inputCls} />
                  </div>
                )}
                <button
                  onClick={terminate}
                  disabled={saving}
                  className="bg-red-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors text-sm"
                >
                  {saving ? "Processing…" : "Confirm Termination"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pb-6">
          <button
            onClick={save}
            disabled={saving}
            className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <Link
            href="/operations-center/atlas-time/employees"
            className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Back to Employees
          </Link>
        </div>
      </div>
    </div>
  );
}
