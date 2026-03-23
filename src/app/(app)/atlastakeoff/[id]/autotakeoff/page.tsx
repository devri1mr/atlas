"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

/* ─── Types ─────────────────────────────────────────────────────────── */
type CatalogOption = {
  id: string; name: string; botanical_name: string | null;
  default_unit: string; default_unit_cost: number; vendor: string | null;
  landscape_category: string | null;
};
type TaskOption = {
  id: string; name: string; unit: string | null;
  minutes_per_unit: number | null; landscape_category: string | null; division_id: string | null;
};
type ItemMatch = {
  id: string;
  catalog_material_id: string | null; material_match_conf: string; material_match_note: string | null;
  task_catalog_id: string | null; labor_match_conf: string; labor_match_note: string | null;
  reviewed: boolean; override_by_user: boolean; excluded: boolean;
  inventory_qty_on_hand: number; inventory_flagged: boolean; pricing_stale: boolean;
};
type ReviewItem = {
  id: string; common_name: string; botanical_name: string | null;
  category: string; size: string | null; container: string | null;
  count: number; unit: string; color: string; sort_order: number;
  match: ItemMatch | null;
  catalog_material: CatalogOption | null;
  task_catalog: TaskOption | null;
  material_cost: number; labor_cost: number;
};
type ReviewData = {
  takeoff: { id: string; name: string; client_name: string | null; address: string | null };
  session: { id: string; pct_matched: number; total_material_cost: number; total_labor_cost: number } | null;
  items: ReviewItem[];
  catalog_options: CatalogOption[];
  task_options: TaskOption[];
  summary: { total_items: number; matched: number; pct_matched: number; total_material_cost: number; total_labor_cost: number; total_cost: number };
};
type Division = { id: string; name: string };

const CAT_ICON: Record<string, string> = {
  tree: "🌳", shrub: "🌿", perennial: "🌸", grass: "🌾", groundcover: "🟫", other: "📦", scope: "◆",
};

function needsMeasurement(item: ReviewItem) {
  return item.count === 0 && (item.category === "groundcover" || item.category === "other" || item.category === "scope");
}
const CONF_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "rgba(34,197,94,0.15)",  text: "#4ade80", label: "Auto-matched" },
  medium: { bg: "rgba(234,179,8,0.15)",  text: "#fbbf24", label: "Suggested" },
  none:   { bg: "rgba(239,68,68,0.12)",  text: "#f87171", label: "No match" },
};

function money(n: number) {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function suggestedPrice(totalCost: number, markupPct: number) {
  if (totalCost <= 0 || markupPct >= 100) return 0;
  return Math.ceil((totalCost / (1 - markupPct / 100)) / 100) * 100;
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function HandoffReviewPage() {
  const { id: takeoffId } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ReviewData | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matchStatus, setMatchStatus] = useState("");
  const [tab, setTab] = useState<"all" | "matched" | "review" | "unmatched">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [autoMeasuring, setAutoMeasuring] = useState(false);
  const [measuringItemId, setMeasuringItemId] = useState<string | null>(null);
  const [measureStatus, setMeasureStatus] = useState("");

  // Dropdown search state per item
  const [materialSearch, setMaterialSearch] = useState<Record<string, string>>({});
  const [taskSearch, setTaskSearch] = useState<Record<string, string>>({});
  const [openMat, setOpenMat] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);

  // Add to catalog panel
  const [addPanel, setAddPanel] = useState<{ item: ReviewItem } | null>(null);
  const [addForm, setAddForm] = useState({ name: "", vendor: "", sku: "", default_unit: "EA", default_unit_cost: "" });
  const [addSaving, setAddSaving] = useState(false);

  // Bid creation
  const [showBidForm, setShowBidForm] = useState(false);
  const [markupPct, setMarkupPct] = useState(50);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [bidDivisionId, setBidDivisionId] = useState("");
  const [bidCreatedBy, setBidCreatedBy] = useState("");
  const [creatingBid, setCreatingBid] = useState(false);

  // Client history
  const [clientHistory, setClientHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick() {
      setOpenMat(null);
      setOpenTask(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ── Load ── */
  useEffect(() => { loadReview(); loadDivisions(); loadClientHistory(); }, [takeoffId]);

  async function loadReview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/handoff/review`);
      const json = await res.json();
      if (json.error) return;
      setData(json);
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadDivisions() {
    const res = await fetch("/api/divisions").catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setDivisions(json.data ?? json.divisions ?? []);
  }

  async function loadClientHistory() {
    const res = await fetch(`/api/takeoff/${takeoffId}/handoff/client-history`).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setClientHistory(json.data ?? []);
  }

  /* ── Auto-measure all area items ── */
  async function runAutoMeasureAll() {
    setAutoMeasuring(true);
    setMeasureStatus("Measuring areas…");
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/auto-measure-all`, { method: "POST" });
      if (!res.ok) { const t = await res.text(); alert("Auto-measure failed: " + t); return; }
      const json = await res.json();
      if (json.error) { alert("Auto-measure failed: " + json.error); return; }
      const count = json.updated?.length ?? 0;
      setMeasureStatus(`✓ Measured ${count} item${count !== 1 ? "s" : ""}${json.scale_found ? ` · scale ${json.scale_found}` : ""}`);
      await loadReview();
      setTimeout(() => setMeasureStatus(""), 6000);
    } catch (e: any) {
      alert("Auto-measure failed: " + e.message);
    } finally {
      setAutoMeasuring(false);
    }
  }

  /* ── Auto-measure single item ── */
  async function runAutoMeasureOne(itemId: string) {
    setMeasuringItemId(itemId);
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/items/${itemId}/auto-measure`, { method: "POST" });
      if (!res.ok) { const t = await res.text(); alert("Measure failed: " + t); return; }
      const json = await res.json();
      if (json.error) { alert("Measure failed: " + json.error); return; }
      // Update item locally
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, count: json.qty, unit: json.unit } : i
      ));
    } catch (e: any) {
      alert("Measure failed: " + e.message);
    } finally {
      setMeasuringItemId(null);
    }
  }

  /* ── Run AI matching ── */
  async function runMatching() {
    setMatching(true);
    setMatchStatus("Running AI matching…");
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/handoff/match`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        alert("Matching failed: " + text);
        return;
      }
      const json = await res.json();
      if (json.error) { alert("Matching failed: " + json.error); return; }
      setMatchStatus(`${json.matched}/${json.total} matched (${json.pct_matched}%)`);
      await loadReview();
    } catch (e: any) {
      alert("Matching failed: " + e.message);
    } finally {
      setMatching(false);
      setTimeout(() => setMatchStatus(""), 4000);
    }
  }

  /* ── Update a match ── */
  async function updateMatch(matchId: string, update: Record<string, any>) {
    setSavingId(matchId);
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/handoff/match/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const json = await res.json();
      if (json.error) { alert("Save failed: " + json.error); return; }
      // Update local state
      setItems(prev => prev.map(item => {
        if (item.match?.id !== matchId) return item;
        const newMatch = { ...item.match, ...update };
        // Update catalog_material and task_catalog from options
        let newCatalogMaterial = item.catalog_material;
        let newTaskCatalog = item.task_catalog;
        if ("catalog_material_id" in update) {
          newCatalogMaterial = data?.catalog_options.find(c => c.id === update.catalog_material_id) ?? null;
        }
        if ("task_catalog_id" in update) {
          newTaskCatalog = data?.task_options.find(t => t.id === update.task_catalog_id) ?? null;
        }
        const matCost = newCatalogMaterial
          ? Number(newCatalogMaterial.default_unit_cost ?? 0) * Number(item.count ?? 0)
          : 0;
        return { ...item, match: newMatch, catalog_material: newCatalogMaterial, task_catalog: newTaskCatalog, material_cost: matCost };
      }));
    } finally {
      setSavingId(null);
    }
  }

  /* ── Add to catalog ── */
  async function handleAddToCatalog() {
    if (!addPanel) return;
    setAddSaving(true);
    try {
      const res = await fetch("/api/materials-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          vendor: addForm.vendor || null,
          sku: addForm.sku || null,
          default_unit: addForm.default_unit,
          default_unit_cost: parseFloat(addForm.default_unit_cost) || 0,
          landscape_category: addPanel.item.category,
          botanical_name: addPanel.item.botanical_name,
        }),
      });
      const json = await res.json();
      if (json.error) { alert("Failed to add: " + json.error); return; }
      // Auto-link this item to the new catalog entry
      const newMat = json.data ?? json.item;
      if (newMat?.id && addPanel.item.match) {
        await updateMatch(addPanel.item.match.id, {
          catalog_material_id: newMat.id,
          material_match_conf: "high",
          material_match_note: "Manually added to catalog",
        });
      }
      // Reload so catalog_options includes the new item
      await loadReview();
      setAddPanel(null);
    } finally {
      setAddSaving(false);
    }
  }

  /* ── Create bid ── */
  async function handleCreateBid() {
    setCreatingBid(true);
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/handoff/create-bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_id: bidDivisionId || null,
          created_by_name: bidCreatedBy || null,
          markup_pct: markupPct,
        }),
      });
      const json = await res.json();
      if (json.error) { alert("Failed to create bid: " + json.error); return; }
      router.push(`/atlasbid/bids/${json.bid_id}/scope`);
    } catch (e: any) {
      alert("Failed: " + e.message);
    } finally {
      setCreatingBid(false);
    }
  }

  /* ── Filtered items ── */
  const filteredItems = useMemo(() => {
    switch (tab) {
      case "matched":
        return items.filter(i => i.match && (i.match.catalog_material_id || i.match.task_catalog_id) && !i.match.excluded && (i.match.material_match_conf === "high" || i.match.labor_match_conf === "high"));
      case "review":
        return items.filter(i => i.match && !i.match.excluded && (i.match.material_match_conf === "medium" || i.match.labor_match_conf === "medium") && i.match.material_match_conf !== "high" && i.match.labor_match_conf !== "high");
      case "unmatched":
        return items.filter(i => !i.match || (i.match.material_match_conf === "none" && i.match.labor_match_conf === "none") || i.match.excluded);
      default:
        return items;
    }
  }, [items, tab]);

  const summary = useMemo(() => {
    const active = items.filter(i => i.match && !i.match.excluded);
    const matCost = active.reduce((s, i) => s + i.material_cost, 0);
    const labCost = active.reduce((s, i) => s + i.labor_cost, 0);
    const matched = items.filter(i => i.match && (i.match.catalog_material_id || i.match.task_catalog_id) && !i.match.excluded).length;
    return {
      matched,
      total: items.length,
      pctMatched: items.length ? Math.round(matched / items.length * 100) : 0,
      matCost,
      labCost,
      totalCost: matCost + labCost,
    };
  }, [items]);

  const suggested = suggestedPrice(summary.totalCost, markupPct);

  const tabCounts = useMemo(() => ({
    all: items.length,
    matched: items.filter(i => i.match && (i.match.material_match_conf === "high" || i.match.labor_match_conf === "high") && !i.match.excluded).length,
    review: items.filter(i => i.match && !i.match.excluded && (i.match.material_match_conf === "medium" || i.match.labor_match_conf === "medium") && i.match.material_match_conf !== "high" && i.match.labor_match_conf !== "high").length,
    unmatched: items.filter(i => !i.match || (i.match.material_match_conf === "none" && i.match.labor_match_conf === "none") || i.match.excluded).length,
  }), [items]);

  /* ─── Loading state ──────────────────────────────────────── */
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: "#0f1923", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
      Loading handoff…
    </div>
  );

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0f1923", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .dropdown-opt:hover { background: rgba(255,255,255,0.08) !important; }
        .item-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg,#0d1f3c,#1a3a6b)", padding: "8px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          onClick={() => router.push(`/atlastakeoff/${takeoffId}`)}
          style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 7, padding: "6px 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}
        >← Back</button>

        <div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
            AutoTakeoff{data?.takeoff.name ? ` · ${data.takeoff.name}` : ""}
          </div>
          {data?.takeoff.client_name && (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
              {data.takeoff.client_name}{data.takeoff.address ? ` · ${data.takeoff.address}` : ""}
            </div>
          )}
        </div>

        {/* Match progress pill */}
        {data?.session && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: "4px 10px" }}>
            <div style={{ width: 80, height: 5, background: "rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ width: `${summary.pctMatched}%`, height: "100%", background: summary.pctMatched > 80 ? "#4ade80" : summary.pctMatched > 50 ? "#fbbf24" : "#f87171", borderRadius: 10, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>{summary.pctMatched}% matched</span>
          </div>
        )}

        {clientHistory.length > 0 && (
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 7, padding: "5px 10px", color: "#fbbf24", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
          >
            📋 {clientHistory.length} prior bid{clientHistory.length > 1 ? "s" : ""}
          </button>
        )}

        {matchStatus && <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>{matchStatus}</span>}
        {measureStatus && <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>{measureStatus}</span>}

        <div style={{ flex: 1 }} />

        {items.some(i => needsMeasurement(i)) && (
          <button
            onClick={runAutoMeasureAll}
            disabled={autoMeasuring}
            style={{ background: autoMeasuring ? "rgba(96,165,250,0.3)" : "linear-gradient(135deg,#1d4ed8,#1e40af)", border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", cursor: autoMeasuring ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: autoMeasuring ? 0.7 : 1 }}
          >
            {autoMeasuring
              ? <><span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Measuring…</>
              : "📐 Auto-measure all"}
          </button>
        )}

        <button
          onClick={runMatching}
          disabled={matching}
          style={{ background: matching ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", cursor: matching ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: matching ? 0.7 : 1 }}
        >
          {matching
            ? <><span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Matching…</>
            : data?.session ? "↺ Re-run Matching" : "✦ Run AI Matching"}
        </button>

        {data?.session && summary.matched > 0 && (
          <button
            onClick={() => setShowBidForm(true)}
            style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 8, padding: "7px 16px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
          >
            Create Bid →
          </button>
        )}
      </div>

      {/* ── Client history banner ── */}
      {showHistory && clientHistory.length > 0 && (
        <div style={{ background: "rgba(234,179,8,0.08)", borderBottom: "1px solid rgba(234,179,8,0.2)", padding: "8px 16px" }}>
          <div style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Prior Bids for this Client</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {clientHistory.map((bid: any) => (
              <div
                key={bid.id}
                onClick={() => router.push(`/atlasbid/bids/${bid.id}/scope`)}
                style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.7)" }}
              >
                <div style={{ fontWeight: 600 }}>{bid.client_name} {bid.client_last_name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)" }}>{bid.sell_rounded ? money(bid.sell_rounded) : "—"} · {new Date(bid.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 2, padding: "8px 16px", background: "rgba(0,0,0,0.3)", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {(["all", "matched", "review", "unmatched"] as const).map(t => {
          const labels = { all: "All", matched: "✅ Auto-matched", review: "⚠️ Needs Review", unmatched: "❌ Unmatched" };
          const counts = { all: tabCounts.all, matched: tabCounts.matched, review: tabCounts.review, unmatched: tabCounts.unmatched };
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ background: active ? "rgba(255,255,255,0.12)" : "transparent", border: active ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent", borderRadius: 8, padding: "5px 12px", color: active ? "#fff" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, display: "flex", alignItems: "center", gap: 6 }}
            >
              {labels[t]}
              <span style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{counts[t]}</span>
            </button>
          );
        })}

        {!data?.session && (
          <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.4)", fontSize: 12, display: "flex", alignItems: "center" }}>
            Click "Run AI Matching" to begin
          </div>
        )}
      </div>

      {/* ── Item list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 140px" }}>
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
            {data?.session ? "No items in this category" : "Run AI Matching to see results"}
          </div>
        ) : filteredItems.map(item => (
          <MatchRow
            key={item.id}
            item={item}
            catalogOptions={data?.catalog_options ?? []}
            taskOptions={data?.task_options ?? []}
            savingId={savingId}
            materialSearch={materialSearch[item.id] ?? ""}
            taskSearch={taskSearch[item.id] ?? ""}
            openMat={openMat}
            openTask={openTask}
            onMaterialSearchChange={v => setMaterialSearch(p => ({ ...p, [item.id]: v }))}
            onTaskSearchChange={v => setTaskSearch(p => ({ ...p, [item.id]: v }))}
            onOpenMat={() => { setOpenMat(item.id); setOpenTask(null); }}
            onOpenTask={() => { setOpenTask(item.id); setOpenMat(null); }}
            onCloseMat={() => setOpenMat(null)}
            onCloseTask={() => setOpenTask(null)}
            onSelectMaterial={async (matId) => {
              setOpenMat(null);
              if (!item.match) return;
              await updateMatch(item.match.id, {
                catalog_material_id: matId,
                material_match_conf: matId ? "high" : "none",
              });
            }}
            onSelectTask={async (taskId) => {
              setOpenTask(null);
              if (!item.match) return;
              await updateMatch(item.match.id, {
                task_catalog_id: taskId,
                labor_match_conf: taskId ? "high" : "none",
              });
            }}
            onExclude={async () => {
              if (!item.match) return;
              await updateMatch(item.match.id, { excluded: !item.match.excluded });
            }}
            onAddToCatalog={() => {
              setAddForm({ name: item.common_name, vendor: "", sku: "", default_unit: "EA", default_unit_cost: "" });
              setAddPanel({ item });
            }}
            onAutoMeasure={() => runAutoMeasureOne(item.id)}
            measuringThisItem={measuringItemId === item.id}
          />
        ))}
      </div>

      {/* ── Bottom bid preview bar ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, #0d1f3c, rgba(13,31,60,0.97))", borderTop: "1px solid rgba(255,255,255,0.1)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 20, zIndex: 100 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Materials</div>
            <div style={{ color: "#60a5fa", fontSize: 15, fontWeight: 700 }}>{money(summary.matCost)}</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Labor</div>
            <div style={{ color: "#a78bfa", fontSize: 15, fontWeight: 700 }}>{money(summary.labCost)}</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Cost</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: 700 }}>{money(summary.totalCost)}</div>
          </div>
        </div>

        <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.1)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Markup</span>
          <input
            type="range" min={0} max={85} step={1} value={markupPct}
            onChange={e => setMarkupPct(Number(e.target.value))}
            style={{ width: 100, accentColor: "#4ade80" }}
          />
          <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 700, minWidth: 36 }}>{markupPct}%</span>
        </div>

        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Suggested Price</div>
          <div style={{ color: "#4ade80", fontSize: 18, fontWeight: 800 }}>{money(suggested)}</div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
          {summary.matched}/{summary.total} items matched
        </div>

        <button
          onClick={() => setShowBidForm(true)}
          disabled={summary.matched === 0}
          style={{ background: summary.matched > 0 ? "linear-gradient(135deg,#16a34a,#15803d)" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", cursor: summary.matched > 0 ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 700, opacity: summary.matched > 0 ? 1 : 0.4 }}
        >
          Create Bid →
        </button>
      </div>

      {/* ── Add to Catalog slide-out ── */}
      {addPanel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          <div onClick={() => setAddPanel(null)} style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ width: 380, background: "#0d1f3c", borderLeft: "1px solid rgba(255,255,255,0.1)", padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Add to Catalog</div>
              <button onClick={() => setAddPanel(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>

            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Takeoff item</div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{addPanel.item.common_name}</div>
              {addPanel.item.botanical_name && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontStyle: "italic" }}>{addPanel.item.botanical_name}</div>}
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{addPanel.item.size ?? ""} · {addPanel.item.count} {addPanel.item.unit}</div>
            </div>

            {[
              { label: "Material Name *", field: "name", placeholder: addPanel.item.common_name },
              { label: "Vendor", field: "vendor", placeholder: "e.g. Monrovia, SiteOne" },
              { label: "SKU / Item #", field: "sku", placeholder: "Optional" },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>{label}</label>
                <input
                  value={(addForm as any)[field]}
                  onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            ))}

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>Unit</label>
                <select
                  value={addForm.default_unit}
                  onChange={e => setAddForm(f => ({ ...f, default_unit: e.target.value }))}
                  style={{ width: "100%", background: "#1a3a6b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }}
                >
                  {["EA", "GAL", "LF", "SF", "SY", "CY", "TON", "BAG", "LB", "YD", "SQFT"].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>Unit Cost</label>
                <input
                  type="number" step="0.01" min="0"
                  value={addForm.default_unit_cost}
                  onChange={e => setAddForm(f => ({ ...f, default_unit_cost: e.target.value }))}
                  placeholder="0.00"
                  style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            </div>

            <button
              onClick={handleAddToCatalog}
              disabled={!addForm.name || addSaving}
              style={{ background: !addForm.name || addSaving ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 10, padding: "12px 20px", color: "#fff", cursor: !addForm.name || addSaving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, opacity: !addForm.name || addSaving ? 0.5 : 1 }}
            >
              {addSaving ? "Saving…" : "Add to Catalog & Link"}
            </button>
          </div>
        </div>
      )}

      {/* ── Create Bid modal ── */}
      {showBidForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
          <div style={{ background: "#0d1f3c", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, width: 420, maxWidth: "90vw" }}>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Create Bid from Handoff</div>

            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 12, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 14 }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Materials</div>
                  <div style={{ color: "#60a5fa", fontSize: 16, fontWeight: 700 }}>{money(summary.matCost)}</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Labor</div>
                  <div style={{ color: "#a78bfa", fontSize: 16, fontWeight: 700 }}>{money(summary.labCost)}</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Suggested</div>
                  <div style={{ color: "#4ade80", fontSize: 16, fontWeight: 700 }}>{money(suggested)}</div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>Division (optional)</label>
                <select
                  value={bidDivisionId}
                  onChange={e => setBidDivisionId(e.target.value)}
                  style={{ width: "100%", background: "#1a3a6b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13 }}
                >
                  <option value="">— Select Division —</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>Created By (optional)</label>
                <input
                  value={bidCreatedBy}
                  onChange={e => setBidCreatedBy(e.target.value)}
                  placeholder="Salesperson name"
                  style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Target Markup</label>
                  <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 700 }}>{markupPct}%</span>
                </div>
                <input
                  type="range" min={0} max={85} step={1} value={markupPct}
                  onChange={e => setMarkupPct(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#4ade80" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                onClick={() => setShowBidForm(false)}
                style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, padding: "11px 0", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >Cancel</button>
              <button
                onClick={handleCreateBid}
                disabled={creatingBid}
                style={{ flex: 2, background: creatingBid ? "rgba(22,163,74,0.4)" : "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 10, padding: "11px 0", color: "#fff", cursor: creatingBid ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700 }}
              >
                {creatingBid
                  ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Creating…</span>
                  : `Create Bid · ${money(suggested)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MatchRow Component ─────────────────────────────────────────────── */
function MatchRow({
  item, catalogOptions, taskOptions, savingId,
  materialSearch, taskSearch, openMat, openTask,
  onMaterialSearchChange, onTaskSearchChange,
  onOpenMat, onOpenTask, onCloseMat, onCloseTask,
  onSelectMaterial, onSelectTask, onExclude, onAddToCatalog,
  onAutoMeasure, measuringThisItem,
}: {
  item: ReviewItem;
  catalogOptions: CatalogOption[];
  taskOptions: TaskOption[];
  savingId: string | null;
  materialSearch: string;
  taskSearch: string;
  openMat: string | null;
  openTask: string | null;
  onMaterialSearchChange: (v: string) => void;
  onTaskSearchChange: (v: string) => void;
  onOpenMat: () => void;
  onOpenTask: () => void;
  onCloseMat: () => void;
  onCloseTask: () => void;
  onSelectMaterial: (id: string | null) => void;
  onSelectTask: (id: string | null) => void;
  onExclude: () => void;
  onAddToCatalog: () => void;
  onAutoMeasure: () => void;
  measuringThisItem: boolean;
}) {
  const isSaving = savingId === item.match?.id;
  const isMatOpen = openMat === item.id;
  const isTaskOpen = openTask === item.id;

  const filteredCatalog = catalogOptions.filter(c =>
    !materialSearch || c.name.toLowerCase().includes(materialSearch.toLowerCase()) ||
    (c.botanical_name ?? "").toLowerCase().includes(materialSearch.toLowerCase())
  );
  const filteredTasks = taskOptions.filter(t =>
    !taskSearch || t.name.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const matConf = CONF_COLORS[item.match?.material_match_conf ?? "none"];
  const labConf = CONF_COLORS[item.match?.labor_match_conf ?? "none"];
  const excluded = item.match?.excluded;

  return (
    <div
      className="item-row"
      style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", opacity: excluded ? 0.4 : 1, transition: "opacity 0.2s", position: "relative" }}
    >
      {isSaving && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Category icon */}
        <div style={{ width: 36, height: 36, borderRadius: 8, background: item.color + "22", border: `1px solid ${item.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {CAT_ICON[item.category] ?? "📦"}
        </div>

        {/* Item info */}
        <div style={{ flex: "0 0 180px" }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{item.common_name}</div>
          {item.botanical_name && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontStyle: "italic" }}>{item.botanical_name}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            <span style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, padding: "1px 6px", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{item.count} {item.unit}</span>
            {item.size && <span style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, padding: "1px 6px", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{item.size}</span>}
          </div>
        </div>

        {/* Material match */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Material</span>
            {item.match && (
              <span style={{ background: matConf.bg, color: matConf.text, borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>{matConf.label}</span>
            )}
            {item.match?.pricing_stale && (
              <span style={{ background: "rgba(234,179,8,0.15)", color: "#fbbf24", borderRadius: 10, padding: "1px 7px", fontSize: 10 }} title="Pricing book may be outdated">⚠ Stale price</span>
            )}
            {item.match?.inventory_flagged && (
              <span style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", borderRadius: 10, padding: "1px 7px", fontSize: 10 }} title={`${item.match.inventory_qty_on_hand} in stock`}>📦 In Stock</span>
            )}
            {needsMeasurement(item) && (
              <button
                onClick={onAutoMeasure}
                disabled={measuringThisItem}
                style={{ background: measuringThisItem ? "rgba(96,165,250,0.1)" : "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", borderRadius: 10, padding: "1px 8px", fontSize: 10, cursor: measuringThisItem ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {measuringThisItem
                  ? <><span style={{ width: 8, height: 8, border: "1.5px solid rgba(96,165,250,0.3)", borderTopColor: "#60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Measuring…</>
                  : "📐 Auto-measure"}
              </button>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <div
              onClick={item.match ? onOpenMat : undefined}
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px",
                cursor: item.match ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6,
                color: item.catalog_material ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 12,
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.catalog_material ? item.catalog_material.name : (item.match ? "Select catalog material…" : "No match record")}
              </span>
              {item.catalog_material && (
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, flexShrink: 0 }}>
                  {money(item.catalog_material.default_unit_cost ?? 0)}/{item.catalog_material.default_unit}
                </span>
              )}
              {item.match && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>▾</span>}
            </div>

            {isMatOpen && (
              <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#0d2a50", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, zIndex: 50, maxHeight: 260, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 8px 4px" }}>
                  <input
                    autoFocus
                    value={materialSearch}
                    onChange={e => onMaterialSearchChange(e.target.value)}
                    placeholder="Search catalog…"
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 10px", color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  <div
                    className="dropdown-opt"
                    onClick={() => { onSelectMaterial(null); onCloseMat(); }}
                    style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}
                  >— Clear match</div>
                  {filteredCatalog.slice(0, 80).map(c => (
                    <div
                      key={c.id}
                      className="dropdown-opt"
                      onClick={() => { onSelectMaterial(c.id); onCloseMat(); onMaterialSearchChange(""); }}
                      style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div>
                        <div>{c.name}</div>
                        {c.botanical_name && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontStyle: "italic" }}>{c.botanical_name}</div>}
                      </div>
                      <span style={{ color: "#4ade80", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{money(c.default_unit_cost ?? 0)}/{c.default_unit}</span>
                    </div>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <div style={{ padding: "12px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>No matches</div>
                  )}
                </div>
                <div
                  onClick={() => { onCloseMat(); onAddToCatalog(); }}
                  style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 12, color: "#60a5fa", fontWeight: 600 }}
                >+ Add "{item.common_name}" to catalog</div>
              </div>
            )}
          </div>

          {item.material_cost > 0 && (
            <div style={{ color: "#60a5fa", fontSize: 11, marginTop: 3 }}>Mat cost: {money(item.material_cost)}</div>
          )}
        </div>

        {/* Labor match */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Labor</span>
            {item.match && (
              <span style={{ background: labConf.bg, color: labConf.text, borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>{labConf.label}</span>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <div
              onClick={item.match ? onOpenTask : undefined}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px", cursor: item.match ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6, color: item.task_catalog ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 12 }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.task_catalog ? item.task_catalog.name : (item.match ? "Select labor task…" : "—")}
              </span>
              {item.task_catalog && (
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, flexShrink: 0 }}>
                  {item.task_catalog.minutes_per_unit}min/{item.task_catalog.unit ?? "EA"}
                </span>
              )}
              {item.match && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>▾</span>}
            </div>

            {isTaskOpen && (
              <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#0d2a50", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, zIndex: 50, maxHeight: 260, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 8px 4px" }}>
                  <input
                    autoFocus
                    value={taskSearch}
                    onChange={e => onTaskSearchChange(e.target.value)}
                    placeholder="Search tasks…"
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 10px", color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  <div
                    className="dropdown-opt"
                    onClick={() => { onSelectTask(null); onCloseTask(); }}
                    style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}
                  >— Clear match</div>
                  {filteredTasks.slice(0, 80).map(t => (
                    <div
                      key={t.id}
                      className="dropdown-opt"
                      onClick={() => { onSelectTask(t.id); onCloseTask(); onTaskSearchChange(""); }}
                      style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <span>{t.name}</span>
                      {t.minutes_per_unit && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{t.minutes_per_unit}min/{t.unit ?? "EA"}</span>}
                    </div>
                  ))}
                  {filteredTasks.length === 0 && (
                    <div style={{ padding: "12px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>No matches</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {item.labor_cost > 0 && (
            <div style={{ color: "#a78bfa", fontSize: 11, marginTop: 3 }}>Labor cost: {money(item.labor_cost)}</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, alignItems: "flex-end" }}>
          {item.match && (
            <button
              onClick={onExclude}
              title={excluded ? "Include item" : "Exclude from bid"}
              style={{ background: excluded ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${excluded ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: excluded ? "#4ade80" : "#f87171" }}
            >
              {excluded ? "Include" : "Exclude"}
            </button>
          )}
          {item.match && !item.catalog_material && (
            <button
              onClick={onAddToCatalog}
              style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "#60a5fa" }}
            >
              + Add to catalog
            </button>
          )}
          {(item.material_cost > 0 || item.labor_cost > 0) && (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "right" }}>
              Total: {money(item.material_cost + item.labor_cost)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
