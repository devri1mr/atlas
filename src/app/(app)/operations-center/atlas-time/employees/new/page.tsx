"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2";

type Department = { id: string; name: string };
type Division = { id: string; name: string; active: boolean; time_clock_only: boolean };
type UniformItem = { key: string; item: string; qty: number; issued_date: string; returned: boolean };

const T_SHIRT_SIZES = ["XS","S","M","L","XL","2XL","3XL","4XL"];
const JACKET_SIZES = ["XS","S","M","L","XL","2XL","3XL","4XL"];
const COMMON_ITEMS = ["T-Shirt","Polo","Work Pants","Shorts","Hoodie","Work Jacket","Rain Jacket","Rain Pants","Safety Vest","Baseball Cap","Hi-Vis Vest","Gloves","Work Boots"];

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
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", preferred_name: "", date_of_birth: "",
    hire_date: new Date().toISOString().slice(0, 10),
    personal_email: "", work_email: "", phone: "",
    address_line1: "", address_line2: "", city: "", state: "", zip: "",
    department_id: "", division_id: "", job_title: "",
    pay_type: "hourly", default_pay_rate: "",
    t_shirt_size: "", jacket_size: "", pants_size: "", hat_size: "", boot_size: "",
    uniform_issued_date: "", uniform_notes: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    notes: "",
  });

  // Uniform items
  const [uniformItems, setUniformItems] = useState<UniformItem[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemDate, setNewItemDate] = useState(new Date().toISOString().slice(0, 10));

  function set(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function loadLists() {
    const [deptRes, divRes] = await Promise.all([
      fetch("/api/atlas-time/departments", { cache: "no-store" }),
      fetch("/api/atlas-time/divisions", { cache: "no-store" }),
    ]);
    const deptJson = await deptRes.json().catch(() => null);
    const divJson = await divRes.json().catch(() => null);
    setDepartments(deptJson?.departments ?? []);
    setDivisions((divJson?.divisions ?? []).filter((d: Division) => d.active));
  }

  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError("First and last name are required."); return; }
    if (!form.hire_date) { setError("Hire date is required."); return; }
    try {
      setSaving(true);
      setError("");
      const body: Record<string, any> = { ...form, uniform_items: uniformItems };
      if (body.default_pay_rate) body.default_pay_rate = Number(body.default_pay_rate);
      Object.keys(body).forEach(k => { if (body[k] === "") body[k] = null; });

      const res = await fetch("/api/atlas-time/employees", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      router.push(`/operations-center/atlas-time/employees/${json.employee.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Uniform items
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

  useEffect(() => { loadLists(); }, []);

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
            <span className="text-white/80">New Team Member</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">New Team Member</h1>
          <p className="text-white/50 text-sm mt-1">Add a new team member to Atlas HR.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Section title="Name & Identity">
          <TwoCol>
            <div>
              <label className={labelCls}>First Name *</label>
              <input value={form.first_name} onChange={e => set("first_name", e.target.value)} className={inputCls} placeholder="First name" />
            </div>
            <div>
              <label className={labelCls}>Last Name *</label>
              <input value={form.last_name} onChange={e => set("last_name", e.target.value)} className={inputCls} placeholder="Last name" />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Preferred / Nickname</label>
              <p className={descCls}>Shown on kiosk if set.</p>
              <input value={form.preferred_name} onChange={e => set("preferred_name", e.target.value)} className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
        </Section>

        <Section title="Employment">
          <TwoCol>
            <div>
              <label className={labelCls}>Hire Date *</label>
              <input type="date" value={form.hire_date} onChange={e => set("hire_date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Job Title</label>
              <input value={form.job_title} onChange={e => set("job_title", e.target.value)} className={inputCls} placeholder="e.g. Crew Leader" />
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Department</label>
              <select value={form.department_id} onChange={e => set("department_id", e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Division</label>
              <select value={form.division_id} onChange={e => set("division_id", e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.time_clock_only ? " (Time Clock)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </TwoCol>
          <TwoCol>
            <div>
              <label className={labelCls}>Pay Type</label>
              <select value={form.pay_type} onChange={e => set("pay_type", e.target.value)} className={inputCls}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salaried (OT eligible)</option>
                <option value="exempt_salary">Salaried Exempt</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{form.pay_type === "hourly" ? "Hourly Rate" : "Annual Salary"}</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                <input type="number" min={0} step={0.01} value={form.default_pay_rate}
                  onChange={e => set("default_pay_rate", e.target.value)}
                  className={inputCls + " pl-7"}
                  placeholder={form.pay_type === "hourly" ? "0.00 / hr" : "0.00 / yr"} />
              </div>
            </div>
          </TwoCol>
        </Section>

        <Section title="Contact Information">
          <TwoCol>
            <div>
              <label className={labelCls}>Mobile Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls} placeholder="(555) 555-5555" />
            </div>
            <div>
              <label className={labelCls}>Personal Email</label>
              <input type="email" value={form.personal_email} onChange={e => set("personal_email", e.target.value)} className={inputCls} placeholder="personal@email.com" />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Address</label>
            <input value={form.address_line1} onChange={e => set("address_line1", e.target.value)} className={inputCls + " mb-2"} placeholder="Street address" />
            <input value={form.address_line2} onChange={e => set("address_line2", e.target.value)} className={inputCls} placeholder="Apt, suite, etc. (optional)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={labelCls}>City</label>
              <input value={form.city} onChange={e => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={form.state} onChange={e => set("state", e.target.value)} className={inputCls} maxLength={2} placeholder="MI" />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input value={form.zip} onChange={e => set("zip", e.target.value)} className={inputCls} placeholder="49001" />
            </div>
          </div>
        </Section>

        <Section title="Emergency Contact">
          <TwoCol>
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={form.emergency_contact_name} onChange={e => set("emergency_contact_name", e.target.value)} className={inputCls} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.emergency_contact_phone} onChange={e => set("emergency_contact_phone", e.target.value)} className={inputCls} placeholder="(555) 555-5555" />
            </div>
          </TwoCol>
        </Section>

        {/* Uniform & Gear */}
        <Section title="Uniform & Gear">
          {/* Sizes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sizes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>T-Shirt</label>
                <select value={form.t_shirt_size} onChange={e => set("t_shirt_size", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {T_SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Jacket / Hoodie</label>
                <select value={form.jacket_size} onChange={e => set("jacket_size", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {JACKET_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Pants / Shorts</label>
                <input value={form.pants_size} onChange={e => set("pants_size", e.target.value)} className={inputCls} placeholder="e.g. 32×30" />
              </div>
              <div>
                <label className={labelCls}>Hat / Cap</label>
                <input value={form.hat_size} onChange={e => set("hat_size", e.target.value)} className={inputCls} placeholder="e.g. S/M or 7¼" />
              </div>
              <div>
                <label className={labelCls}>Boot / Shoe</label>
                <input value={form.boot_size} onChange={e => set("boot_size", e.target.value)} className={inputCls} placeholder="e.g. 10.5W" />
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
                <div className="grid grid-cols-[1fr_56px_130px_80px_32px] gap-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <span>Item</span><span className="text-center">Qty</span><span>Issued</span><span className="text-center">Returned</span><span />
                </div>
                {uniformItems.map(item => (
                  <div key={item.key} className="grid grid-cols-[1fr_56px_130px_80px_32px] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-sm font-medium text-gray-800">{item.item}</span>
                    <input type="number" min={1} value={item.qty}
                      onChange={e => updateUniformItem(item.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                    <input type="date" value={item.issued_date}
                      onChange={e => updateUniformItem(item.key, { issued_date: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                    <div className="flex justify-center">
                      <button onClick={() => updateUniformItem(item.key, { returned: !item.returned })}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.returned ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}>
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
                  <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                    list="uniform-item-suggestions" className={inputCls} placeholder="e.g. T-Shirt, Rain Jacket…" />
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

          <TwoCol>
            <div>
              <label className={labelCls}>Uniform Kit Issued Date</label>
              <input type="date" value={form.uniform_issued_date} onChange={e => set("uniform_issued_date", e.target.value)} className={inputCls} />
            </div>
          </TwoCol>
          <div>
            <label className={labelCls}>Uniform Notes</label>
            <textarea value={form.uniform_notes} onChange={e => set("uniform_notes", e.target.value)}
              rows={2} className={inputCls + " resize-none"}
              placeholder="Special fit notes, alterations, missing items…" />
          </div>
        </Section>

        <Section title="HR Notes">
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            rows={3} className={inputCls + " resize-none"} placeholder="Internal notes…" />
        </Section>

        <div className="flex items-center gap-3 pb-6">
          <button onClick={save} disabled={saving}
            className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm">
            {saving ? "Saving…" : "Add Team Member"}
          </button>
          <Link href="/operations-center/atlas-time/employees"
            className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
