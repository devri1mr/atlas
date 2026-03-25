"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2";

type Department = { id: string; name: string };

function Section({ title, children }: { children: React.ReactNode; title: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

export default function NewEmployeePage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    preferred_name: "",
    date_of_birth: "",
    hire_date: new Date().toISOString().slice(0, 10),
    personal_email: "",
    work_email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip: "",
    department_id: "",
    division_id: "",
    job_title: "",
    pay_type: "hourly",
    default_pay_rate: "",
    t_shirt_size: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function loadDepartments() {
    const res = await fetch("/api/atlas-time/departments", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setDepartments(json?.departments ?? []);
  }

  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!form.hire_date) {
      setError("Hire date is required.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const body: Record<string, any> = { ...form };
      if (body.default_pay_rate) body.default_pay_rate = Number(body.default_pay_rate);
      // Clear empty optional fields
      Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });

      const res = await fetch("/api/atlas-time/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save employee");
      router.push(`/operations-center/atlas-time/employees/${json.employee.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save employee");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { loadDepartments(); }, []);

  const T_SHIRT_SIZES = ["XS","S","M","L","XL","2XL","3XL","4XL"];

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
            <span className="text-white/80">New Employee</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">New Employee</h1>
          <p className="text-white/50 text-sm mt-1">Add a new team member to Atlas Time.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Name */}
        <Section title="Name & Identity">
          <TwoCol>
            <div>
              <label className={labelCls}>First Name *</label>
              <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inputCls} placeholder="First name" />
            </div>
            <div>
              <label className={labelCls}>Last Name *</label>
              <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inputCls} placeholder="Last name" />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Preferred / Nickname</label>
              <p className={descCls}>Shown on kiosk and clock-in screen if set.</p>
              <input value={form.preferred_name} onChange={(e) => set("preferred_name", e.target.value)} className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <p className={descCls}>Used for birthday reminders.</p>
              <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
        </Section>

        {/* Employment */}
        <Section title="Employment">
          <TwoCol>
            <div>
              <label className={labelCls}>Hire Date *</label>
              <input type="date" value={form.hire_date} onChange={(e) => set("hire_date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Job Title</label>
              <input value={form.job_title} onChange={(e) => set("job_title", e.target.value)} className={inputCls} placeholder="e.g. Crew Leader" />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Department</label>
              <select value={form.department_id} onChange={(e) => set("department_id", e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Pay Type</label>
              <select value={form.pay_type} onChange={(e) => set("pay_type", e.target.value)} className={inputCls}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salaried (OT eligible)</option>
                <option value="exempt_salary">Salaried Exempt</option>
              </select>
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>{form.pay_type === "hourly" ? "Hourly Rate" : "Annual Salary"}</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
              <input
                type="number" min={0} step={0.01}
                value={form.default_pay_rate}
                onChange={(e) => set("default_pay_rate", e.target.value)}
                className={inputCls + " pl-7"}
                placeholder={form.pay_type === "hourly" ? "0.00 / hr" : "0.00 / yr"}
              />
            </div>
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact Information">
          <TwoCol>
            <div>
              <label className={labelCls}>Mobile Phone</label>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="(555) 555-5555" />
            </div>
            <div>
              <label className={labelCls}>Personal Email</label>
              <input type="email" value={form.personal_email} onChange={(e) => set("personal_email", e.target.value)} className={inputCls} placeholder="personal@email.com" />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Address</label>
            <input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} className={inputCls + " mb-2"} placeholder="Street address" />
            <input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} className={inputCls} placeholder="Apt, suite, etc. (optional)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={labelCls}>City</label>
              <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={form.state} onChange={(e) => set("state", e.target.value)} className={inputCls} maxLength={2} placeholder="MI" />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input value={form.zip} onChange={(e) => set("zip", e.target.value)} className={inputCls} placeholder="49001" />
            </div>
          </div>
        </Section>

        {/* Emergency contact */}
        <Section title="Emergency Contact">
          <TwoCol>
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} className={inputCls} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} className={inputCls} placeholder="(555) 555-5555" />
            </div>
          </TwoCol>
        </Section>

        {/* Uniform */}
        <Section title="Uniform & HR">
          <TwoCol>
            <div>
              <label className={labelCls}>T-Shirt Size</label>
              <select value={form.t_shirt_size} onChange={(e) => set("t_shirt_size", e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {T_SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="Internal notes about this employee…"
            />
          </div>
        </Section>

        {/* Actions */}
        <div className="flex items-center gap-3 pb-6">
          <button
            onClick={save}
            disabled={saving}
            className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
          >
            {saving ? "Saving…" : "Add Employee"}
          </button>
          <Link
            href="/operations-center/atlas-time/employees"
            className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
