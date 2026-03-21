"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Script from "next/script";

type MeasurementRow = {
  id: string;
  bid_id: string;
  label: string;
  shape_type: "polygon" | "polyline";
  path: { lat: number; lng: number }[];
  computed_value: number;
  unit: string;
  created_at: string;
};

type Bid = {
  id: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

type PendingShape = {
  overlay: google.maps.Polygon | google.maps.Polyline;
  shape_type: "polygon" | "polyline";
  computed_value: number;
  unit: string;
};

// Fallback center — Saginaw, MI
const FALLBACK_CENTER = { lat: 43.4195, lng: -83.9508 };
const FALLBACK_ZOOM = 12;

export default function MeasurementsPage() {
  const params = useParams();
  const bidId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [bid, setBid] = useState<Bid | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Pending shape (drawn but not yet labelled/saved)
  const [pendingShape, setPendingShape] = useState<PendingShape | null>(null);
  const [pendingLabel, setPendingLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const dmRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const overlaysRef = useRef<Map<string, google.maps.Polygon | google.maps.Polyline>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Load bid address
  useEffect(() => {
    if (!bidId) return;
    fetch(`/api/bids/${bidId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBid(j?.bid ?? j?.data ?? j ?? null))
      .catch(() => {});
  }, [bidId]);

  // Load saved measurements
  const loadMeasurements = useCallback(async () => {
    if (!bidId) return;
    const res = await fetch(`/api/atlasbid/bid-measurements?bid_id=${bidId}`, { cache: "no-store" });
    const j = await res.json();
    setMeasurements(Array.isArray(j?.rows) ? j.rows : []);
  }, [bidId]);

  useEffect(() => { loadMeasurements(); }, [loadMeasurements]);

  // Init map after Maps script loads + bid is available
  useEffect(() => {
    if (!mapsLoaded || !mapDivRef.current || mapReady) return;

    const g = window.google;
    if (!g?.maps) return;

    const map = new g.maps.Map(mapDivRef.current, {
      mapTypeId: "satellite",
      tilt: 0,
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      mapTypeControl: false,
      fullscreenControl: true,
      streetViewControl: false,
    });

    mapRef.current = map;
    infoWindowRef.current = new g.maps.InfoWindow();

    // Geocode the bid address
    const addressStr = [bid?.address, bid?.city, bid?.state].filter(Boolean).join(", ");
    if (addressStr) {
      const geocoder = new g.maps.Geocoder();
      geocoder.geocode({ address: addressStr }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          map.setCenter(results[0].geometry.location);
          map.setZoom(19);
        }
      });
    }

    // Drawing manager
    const dm = new g.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: true,
      drawingControlOptions: {
        position: g.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          g.maps.drawing.OverlayType.POLYGON,
          g.maps.drawing.OverlayType.POLYLINE,
        ],
      },
      polygonOptions: {
        strokeColor: "#16a34a",
        fillColor: "#16a34a",
        fillOpacity: 0.2,
        strokeWeight: 2,
        editable: true,
      },
      polylineOptions: {
        strokeColor: "#0d2616",
        strokeWeight: 3,
        editable: true,
      },
    });
    dm.setMap(map);
    dmRef.current = dm;

    g.maps.event.addListener(dm, "overlaycomplete", (e: google.maps.drawing.OverlayCompleteEvent) => {
      dm.setDrawingMode(null);
      const type = e.type as "polygon" | "polyline";
      let computed_value = 0;
      let unit = "sqft";

      if (type === "polygon") {
        const poly = e.overlay as google.maps.Polygon;
        const area = g.maps.geometry.spherical.computeArea(poly.getPath());
        computed_value = Math.round(area * 10.7639);
        unit = "sqft";
      } else {
        const line = e.overlay as google.maps.Polyline;
        const length = g.maps.geometry.spherical.computeLength(line.getPath());
        computed_value = Math.round(length * 3.28084);
        unit = "lf";
      }

      setPendingShape({ overlay: e.overlay as google.maps.Polygon | google.maps.Polyline, shape_type: type, computed_value, unit });
      setPendingLabel("");
    });

    setMapReady(true);
  }, [mapsLoaded, bid, mapReady]);

  // Restore saved shapes onto map after map is ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = window.google;
    if (!g?.maps) return;

    measurements.forEach((m) => {
      if (overlaysRef.current.has(m.id)) return; // already drawn
      addOverlayToMap(m);
    });
  }, [mapReady, measurements]);

  function addOverlayToMap(m: MeasurementRow) {
    const g = window.google;
    if (!g?.maps || !mapRef.current) return;

    let overlay: google.maps.Polygon | google.maps.Polyline;

    if (m.shape_type === "polygon") {
      overlay = new g.maps.Polygon({
        map: mapRef.current,
        paths: m.path,
        strokeColor: "#16a34a",
        fillColor: "#16a34a",
        fillOpacity: 0.2,
        strokeWeight: 2,
        editable: false,
      });
    } else {
      overlay = new g.maps.Polyline({
        map: mapRef.current,
        path: m.path,
        strokeColor: "#0d2616",
        strokeWeight: 3,
        editable: false,
      });
    }

    const label = m.label;
    const value = m.computed_value.toLocaleString();
    const unit = m.unit;

    g.maps.event.addListener(overlay, "click", (ev: google.maps.MapMouseEvent) => {
      if (infoWindowRef.current && ev.latLng) {
        infoWindowRef.current.setContent(`<div style="font-size:13px;font-weight:600;padding:2px 4px">${label}<br/><span style="font-weight:400;color:#555">${value} ${unit}</span></div>`);
        infoWindowRef.current.setPosition(ev.latLng);
        infoWindowRef.current.open(mapRef.current!);
      }
    });

    overlaysRef.current.set(m.id, overlay);
  }

  function removeOverlayFromMap(id: string) {
    const overlay = overlaysRef.current.get(id);
    if (overlay) {
      overlay.setMap(null);
      overlaysRef.current.delete(id);
    }
  }

  async function confirmSave() {
    if (!pendingShape || !pendingLabel.trim() || !bidId) return;
    setSaving(true);
    setError(null);

    const { overlay, shape_type, computed_value, unit } = pendingShape;
    const path = (overlay.getPath() as google.maps.MVCArray<google.maps.LatLng>)
      .getArray()
      .map((p) => ({ lat: p.lat(), lng: p.lng() }));

    const res = await fetch("/api/atlasbid/bid-measurements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bid_id: bidId, label: pendingLabel.trim(), shape_type, path, computed_value, unit }),
    });
    const j = await res.json();

    if (!res.ok) {
      setError(j.error ?? "Save failed");
      setSaving(false);
      return;
    }

    const saved: MeasurementRow = j.row;
    setMeasurements((prev) => [...prev, saved]);

    // Register the pending overlay with the saved id so it stays on map
    overlaysRef.current.set(saved.id, overlay);

    // Add click listener for info window
    const g = window.google;
    g.maps.event.addListener(overlay, "click", (ev: google.maps.MapMouseEvent) => {
      if (infoWindowRef.current && ev.latLng) {
        infoWindowRef.current.setContent(`<div style="font-size:13px;font-weight:600;padding:2px 4px">${saved.label}<br/><span style="font-weight:400;color:#555">${saved.computed_value.toLocaleString()} ${saved.unit}</span></div>`);
        infoWindowRef.current.setPosition(ev.latLng);
        infoWindowRef.current.open(mapRef.current!);
      }
    });

    setPendingShape(null);
    setPendingLabel("");
    setSaving(false);
  }

  function discardPending() {
    if (pendingShape) {
      pendingShape.overlay.setMap(null);
      setPendingShape(null);
      setPendingLabel("");
    }
  }

  async function deleteMeasurement(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/atlasbid/bid-measurements/${id}`, { method: "DELETE" });
    if (res.ok) {
      removeOverlayFromMap(id);
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
    }
    setDeletingId(null);
  }

  async function saveRename(id: string) {
    if (!renameDraft.trim()) return;
    const res = await fetch(`/api/atlasbid/bid-measurements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: renameDraft.trim() }),
    });
    if (res.ok) {
      setMeasurements((prev) => prev.map((m) => m.id === id ? { ...m, label: renameDraft.trim() } : m));
    }
    setRenamingId(null);
    setRenameDraft("");
  }

  const totalSqft = measurements.filter((m) => m.unit === "sqft").reduce((s, m) => s + m.computed_value, 0);
  const totalLf = measurements.filter((m) => m.unit === "lf").reduce((s, m) => s + m.computed_value, 0);

  return (
    <>
      <Script
        id="google-maps-measurements"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=drawing,geometry,places`}
        strategy="afterInteractive"
        onLoad={() => setMapsLoaded(true)}
      />

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0d2616]">Property Measurements</h2>
            <p className="text-xs text-gray-500 mt-0.5">Draw areas and lengths directly on the satellite map. Measurements auto-populate bundle fields in the Scope tab.</p>
          </div>
          {measurements.length > 0 && (
            <div className="flex gap-3 text-xs font-semibold">
              {totalSqft > 0 && (
                <span className="bg-green-50 text-green-800 border border-green-200 px-3 py-1.5 rounded-lg">
                  {totalSqft.toLocaleString()} sqft total
                </span>
              )}
              {totalLf > 0 && (
                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg">
                  {totalLf.toLocaleString()} lf total
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        {/* Map + Sidebar */}
        <div className="flex gap-4">
          {/* Map */}
          <div className="flex-1 min-w-0">
            <div className="rounded-xl overflow-hidden border border-[#d7e6db] shadow-sm" style={{ height: 540 }}>
              {!mapsLoaded && (
                <div className="w-full h-full flex items-center justify-center bg-[#f6f8f6]">
                  <div className="text-center space-y-2">
                    <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-gray-500">Loading map…</p>
                  </div>
                </div>
              )}
              <div ref={mapDivRef} className="w-full h-full" />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Use the toolbar above the map to draw polygons (areas) or polylines (lengths)
            </p>
          </div>

          {/* Sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-3">

            {/* Pending shape — label form */}
            {pendingShape && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📐</span>
                  <div>
                    <div className="text-sm font-semibold text-amber-900">Shape drawn</div>
                    <div className="text-xs text-amber-700">
                      {pendingShape.computed_value.toLocaleString()} {pendingShape.unit}
                      {" "}({pendingShape.shape_type === "polygon" ? "area" : "length"})
                    </div>
                  </div>
                </div>
                <input
                  autoFocus
                  type="text"
                  placeholder="Label this measurement…"
                  value={pendingLabel}
                  onChange={(e) => setPendingLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmSave(); if (e.key === "Escape") discardPending(); }}
                  className="border border-amber-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white placeholder-amber-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={confirmSave}
                    disabled={!pendingLabel.trim() || saving}
                    className="flex-1 bg-[#16a34a] text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-40 hover:bg-green-700 transition-colors"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={discardPending}
                    className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg py-2 hover:bg-gray-50 transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Measurements list */}
            <div className="bg-white border border-[#d7e6db] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#d7e6db] flex items-center justify-between">
                <span className="text-sm font-semibold text-[#0d2616]">Measurements</span>
                {measurements.length > 0 && (
                  <span className="text-xs bg-green-100 text-green-800 font-semibold px-2 py-0.5 rounded-full">{measurements.length}</span>
                )}
              </div>

              {measurements.length === 0 && !pendingShape ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl mb-2">🗺️</div>
                  <p className="text-sm text-gray-500">No measurements yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Draw a shape on the map to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#eef3ef]">
                  {measurements.map((m) => (
                    <div key={m.id} className="px-4 py-3 space-y-1.5">
                      {renamingId === m.id ? (
                        <div className="flex gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveRename(m.id); if (e.key === "Escape") { setRenamingId(null); setRenameDraft(""); } }}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                          <button onClick={() => saveRename(m.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg">Save</button>
                          <button onClick={() => { setRenamingId(null); setRenameDraft(""); }} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#0d2616] truncate">{m.label}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.unit === "sqft" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                                {m.unit === "sqft" ? "area" : "length"}
                              </span>
                              <span className="text-xs font-bold text-gray-700">
                                {m.computed_value.toLocaleString()} {m.unit}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => { setRenamingId(m.id); setRenameDraft(m.label); }}
                              className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                              title="Rename"
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854 2.146a.5.5 0 0 0-.707 0l-9 9A.5.5 0 0 0 3 11.5V14a.5.5 0 0 0 .5.5H6a.5.5 0 0 0 .354-.146l9-9a.5.5 0 0 0 0-.707l-2.5-2.5ZM4 11.707l8.5-8.5 1.293 1.293-8.5 8.5H4v-1.293Z"/></svg>
                            </button>
                            <button
                              onClick={() => deleteMeasurement(m.id)}
                              disabled={deletingId === m.id}
                              className="text-red-300 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-40"
                              title="Delete"
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2H5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/></svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Help card */}
            <div className="bg-[#f6f8f6] border border-[#d7e6db] rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#0d2616]">How to use</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>🔷 <strong>Polygon</strong> — trace an area (beds, lawn, patio)</li>
                <li>📏 <strong>Polyline</strong> — trace a length (edging, drainage)</li>
                <li>💡 Saved measurements appear in the Scope tab when loading bundles</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
