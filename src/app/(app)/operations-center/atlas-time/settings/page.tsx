"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  pay_cycle: string;
  pay_period_start_day: number;
  pay_period_anchor_date: string | null;
  payday_day_of_week: number;
  ot_daily_threshold: number | null;
  ot_weekly_threshold: number;
  ot_multiplier: number;
  dt_daily_threshold: number | null;
  dt_multiplier: number;
  lunch_auto_deduct: boolean;
  lunch_deduct_after_hours: number;
  lunch_deduct_minutes: number;
  punch_rounding_minutes: number;
  geofence_enabled: boolean;
  geofence_radius_meters: number;
  kiosk_pin_length: number;
  esta_enabled: boolean;
  esta_accrual_hours_per: number;
  esta_wait_days: number;
  esta_annual_cap_hours: number;
};

const DEFAULTS: Settings = {
  pay_cycle: "weekly",
  pay_period_start_day: 1,
  pay_period_anchor_date: null,
  payday_day_of_week: 5,
  ot_daily_threshold: null,
  ot_weekly_threshold: 40,
  ot_multiplier: 1.5,
  dt_daily_threshold: null,
  dt_multiplier: 2.0,
  lunch_auto_deduct: false,
  lunch_deduct_after_hours: 6,
  lunch_deduct_minutes: 30,
  punch_rounding_minutes: 0,
  geofence_enabled: false,
  geofence_radius_meters: 300,
  kiosk_pin_length: 4,
  esta_enabled: false,
  esta_accrual_hours_per: 30,
  esta_wait_days: 90,
  esta_annual_cap_hours: 72,
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2 leading-relaxed";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4">{children}</div>;
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4 grid grid-cols-2 gap-4">{children}</div>;
}

export default function AtlasTimeSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [s, setS] = useState<Settings>(DEFAULTS);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/atlas-time/settings", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to load settings");
      if (json?.settings) {
        setS({ ...DEFAULTS, ...json.settings });
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/atlas-time/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save settings");
      if (json?.settings) setS({ ...DEFAULTS, ...json.settings });
      setSuccess("Settings saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, []);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
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
            <span className="text-white/80">Settings</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Time Clock Settings</h1>
          <p className="text-white/50 text-sm mt-1">Pay cycle, overtime, lunch deductions, geofencing, kiosk, and compliance.</p>
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

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-1/4 animate-pulse" />
                <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Pay Cycle */}
            <Section title="Pay Cycle">
              <Row>
                <label className={labelCls}>Pay Cycle</label>
                <p className={descCls}>How often payroll periods run.</p>
                <select
                  value={s.pay_cycle}
                  onChange={(e) => set("pay_cycle", e.target.value)}
                  className={inputCls}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-Weekly (every 2 weeks)</option>
                  <option value="semimonthly">Semi-Monthly (1st & 15th)</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Row>
              {(s.pay_cycle === "weekly" || s.pay_cycle === "biweekly") && (
                <Row>
                  <label className={labelCls}>Week Starts On</label>
                  <p className={descCls}>The day each pay period begins.</p>
                  <select
                    value={s.pay_period_start_day}
                    onChange={(e) => set("pay_period_start_day", Number(e.target.value))}
                    className={inputCls}
                  >
                    {dayNames.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </Row>
              )}
              <Row>
                <label className={labelCls}>Last Pay Period Close Date</label>
                <p className={descCls}>The end date of the most recently completed pay period. Used to align Atlas Time to your existing payroll schedule.</p>
                <input
                  type="date"
                  value={s.pay_period_anchor_date ?? ""}
                  onChange={(e) => set("pay_period_anchor_date", e.target.value || null)}
                  className={inputCls}
                />
              </Row>
              <Row>
                <label className={labelCls}>Payday</label>
                <p className={descCls}>The day of the week employees receive their paycheck.</p>
                <select
                  value={s.payday_day_of_week}
                  onChange={(e) => set("payday_day_of_week", Number(e.target.value))}
                  className={inputCls}
                >
                  {dayNames.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </Row>
            </Section>

            {/* Overtime */}
            <Section title="Overtime Rules">
              <TwoCol>
                <div>
                  <label className={labelCls}>Weekly OT After (hrs)</label>
                  <p className={descCls}>Hours before weekly OT kicks in. Standard: 40.</p>
                  <input
                    type="number" min={0} max={80} step={0.5}
                    value={s.ot_weekly_threshold}
                    onChange={(e) => set("ot_weekly_threshold", Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>OT Multiplier</label>
                  <p className={descCls}>Rate multiplier for OT hours. Standard: 1.5×.</p>
                  <input
                    type="number" min={1} max={3} step={0.25}
                    value={s.ot_multiplier}
                    onChange={(e) => set("ot_multiplier", Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </TwoCol>
              <Row>
                <label className={labelCls}>Daily OT After (hrs) — Optional</label>
                <p className={descCls}>Hours before daily OT kicks in. Leave blank to disable (most states).</p>
                <input
                  type="number" min={0} max={24} step={0.5}
                  placeholder="Disabled"
                  value={s.ot_daily_threshold ?? ""}
                  onChange={(e) => set("ot_daily_threshold", e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls}
                />
              </Row>
              <TwoCol>
                <div>
                  <label className={labelCls}>Double Time After (hrs) — Optional</label>
                  <p className={descCls}>Daily hours before double time. Leave blank to disable.</p>
                  <input
                    type="number" min={0} max={24} step={0.5}
                    placeholder="Disabled"
                    value={s.dt_daily_threshold ?? ""}
                    onChange={(e) => set("dt_daily_threshold", e.target.value === "" ? null : Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Double Time Multiplier</label>
                  <p className={descCls}>Rate multiplier for double-time hours.</p>
                  <input
                    type="number" min={1} max={4} step={0.25}
                    value={s.dt_multiplier}
                    onChange={(e) => set("dt_multiplier", Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </TwoCol>
            </Section>

            {/* Lunch */}
            <Section title="Lunch & Break">
              <Row>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={labelCls + " mb-0"}>Auto-Deduct Lunch</label>
                    <p className={descCls + " mt-0.5 mb-0"}>Automatically deduct a lunch break from shifts over a certain length.</p>
                  </div>
                  <Toggle checked={s.lunch_auto_deduct} onChange={(v) => set("lunch_auto_deduct", v)} />
                </div>
              </Row>
              {s.lunch_auto_deduct && (
                <TwoCol>
                  <div>
                    <label className={labelCls}>Deduct After (hrs)</label>
                    <p className={descCls}>Deduct lunch when shift is at least this long.</p>
                    <input
                      type="number" min={1} max={24} step={0.5}
                      value={s.lunch_deduct_after_hours}
                      onChange={(e) => set("lunch_deduct_after_hours", Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Minutes to Deduct</label>
                    <p className={descCls}>How many minutes to subtract from the shift.</p>
                    <input
                      type="number" min={5} max={120} step={5}
                      value={s.lunch_deduct_minutes}
                      onChange={(e) => set("lunch_deduct_minutes", Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                </TwoCol>
              )}
            </Section>

            {/* Rounding */}
            <Section title="Punch Rounding">
              <Row>
                <label className={labelCls}>Round Punches To (minutes)</label>
                <p className={descCls}>Rounds clock-in and clock-out to the nearest interval. Set to 0 to record exact times.</p>
                <select
                  value={s.punch_rounding_minutes}
                  onChange={(e) => set("punch_rounding_minutes", Number(e.target.value))}
                  className={inputCls}
                >
                  <option value={0}>No rounding — exact time</option>
                  <option value={5}>5 minutes</option>
                  <option value={6}>6 minutes (1/10 hr)</option>
                  <option value={15}>15 minutes (quarter hour)</option>
                  <option value={30}>30 minutes (half hour)</option>
                </select>
              </Row>
            </Section>

            {/* Geofencing */}
            <Section title="Geofencing">
              <Row>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={labelCls + " mb-0"}>Enable Geofence Enforcement</label>
                    <p className={descCls + " mt-0.5 mb-0"}>Require employees to be within a defined radius of a job site to punch in/out from mobile.</p>
                  </div>
                  <Toggle checked={s.geofence_enabled} onChange={(v) => set("geofence_enabled", v)} />
                </div>
              </Row>
              {s.geofence_enabled && (
                <Row>
                  <label className={labelCls}>Default Radius (meters)</label>
                  <p className={descCls}>Distance from the geofence center within which punches are accepted. Can be overridden per location.</p>
                  <input
                    type="number" min={50} max={5000} step={25}
                    value={s.geofence_radius_meters}
                    onChange={(e) => set("geofence_radius_meters", Number(e.target.value))}
                    className={inputCls}
                  />
                </Row>
              )}
            </Section>

            {/* Kiosk */}
            <Section title="Kiosk / iPad Punch Station">
              <Row>
                <label className={labelCls}>Employee PIN Length</label>
                <p className={descCls}>Number of digits in each employee's kiosk PIN. Changing this requires issuing new PINs.</p>
                <select
                  value={s.kiosk_pin_length}
                  onChange={(e) => set("kiosk_pin_length", Number(e.target.value))}
                  className={inputCls}
                >
                  <option value={4}>4 digits</option>
                  <option value={5}>5 digits</option>
                  <option value={6}>6 digits</option>
                </select>
              </Row>
            </Section>

            {/* Michigan ESTA */}
            <Section title="Michigan ESTA — Earned Sick Time">
              <Row>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={labelCls + " mb-0"}>Enable ESTA Sick Time Accrual</label>
                    <p className={descCls + " mt-0.5 mb-0"}>
                      Michigan requires employers with 10+ employees to accrue 1 hour of paid sick time per 30 hours worked, up to 72 hrs/year, with a 90-day waiting period before use.
                    </p>
                  </div>
                  <Toggle checked={s.esta_enabled} onChange={(v) => set("esta_enabled", v)} />
                </div>
              </Row>
              {s.esta_enabled && (
                <>
                  <TwoCol>
                    <div>
                      <label className={labelCls}>Accrue 1 Hr Per (hrs worked)</label>
                      <p className={descCls}>Michigan law: 1 hr per 30. Adjust if your policy is more generous.</p>
                      <input
                        type="number" min={1} max={80} step={1}
                        value={s.esta_accrual_hours_per}
                        onChange={(e) => set("esta_accrual_hours_per", Number(e.target.value))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Waiting Period (days)</label>
                      <p className={descCls}>Employees can't use accrued time until this many days after hire.</p>
                      <input
                        type="number" min={0} max={365} step={1}
                        value={s.esta_wait_days}
                        onChange={(e) => set("esta_wait_days", Number(e.target.value))}
                        className={inputCls}
                      />
                    </div>
                  </TwoCol>
                  <Row>
                    <label className={labelCls}>Annual Cap (hours)</label>
                    <p className={descCls}>Maximum sick hours an employee can accrue per year. Michigan law: 72 hrs.</p>
                    <input
                      type="number" min={0} max={200} step={1}
                      value={s.esta_annual_cap_hours}
                      onChange={(e) => set("esta_annual_cap_hours", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Row>
                </>
              )}
            </Section>

            {/* Save */}
            <div className="flex items-center gap-3 pt-1 pb-6">
              <button
                onClick={save}
                disabled={saving}
                className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
              <button
                onClick={load}
                className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
