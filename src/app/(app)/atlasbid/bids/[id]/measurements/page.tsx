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
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type PendingShape = {
  overlay: google.maps.Polygon | google.maps.Polyline;
  shape_type: "polygon" | "polyline";
  computed_value: number;
  unit: string;
};

type ShapeEntry = {
  overlay: google.maps.Polygon | google.maps.Polyline;
  label: google.maps.Marker;
};

const FALLBACK_CENTER = { lat: 43.4195, lng: -83.9508 };
const FALLBACK_ZOOM = 12;

const SHAPE_COLORS = [
  "#16a34a", "#2563eb", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#0d9488",
];

const QUICK_LABELS = [
  "Front Bed", "Back Bed", "Side Bed", "Island Bed",
  "Front Lawn", "Back Lawn", "Side Lawn",
  "Driveway", "Patio", "Walkway",
  "Drainage", "Edging", "Natural Edge",
];

function computeCentroid(path: { lat: number; lng: number }[]) {
  const lat = path.reduce((s, p) => s + p.lat, 0) / path.length;
  const lng = path.reduce((s, p) => s + p.lng, 0) / path.length;
  return { lat, lng };
}

function computeMidpoint(path: { lat: number; lng: number }[]) {
  const mid = Math.floor(path.length / 2);
  return path[mid] ?? path[0];
}

function formatValue(value: number, unit: string) {
  if (unit === "sqft") {
    const sqyd = Math.round(value / 9);
    return `${value.toLocaleString()} sqft${sqyd > 0 ? ` / ${sqyd.toLocaleString()} sqyd` : ""}`;
  }
  return `${value.toLocaleString()} ${unit}`;
}

function makeMapLabel(
  g: typeof google,
  position: { lat: number; lng: number },
  text: string,
  color: string
): google.maps.Marker {
  return new g.maps.Marker({
    position,
    map: null, // set on map separately
    label: {
      text,
      color: "#fff",
      fontSize: "10px",
      fontWeight: "700",
    },
    icon: {
      path: g.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: color,
      fillOpacity: 0.85,
      strokeColor: "#fff",
      strokeWeight: 1.5,
    },
    zIndex: 10,
  });
}

export default function MeasurementsPage() {
  const params = useParams();
  const bidId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [bid, setBid] = useState<Bid | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [geocodedPos, setGeocodedPos] = useState<{ lat: number; lng: number } | null>(null);

  const [pendingShape, setPendingShape] = useState<PendingShape | null>(null);
  const [pendingLabel, setPendingLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<"polygon" | "polyline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buildingLoaded, setBuildingLoaded] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const dmRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const shapesRef = useRef<Map<string, ShapeEntry>>(new Map());
  const buildingOverlaysRef = useRef<google.maps.Polygon[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const colorIndexRef = useRef(0);

  // Load bid
  useEffect(() => {
    if (!bidId) return;
    fetch(`/api/bids/${bidId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBid(j?.data ?? j?.bid ?? null))
      .catch(() => {});
  }, [bidId]);

  // Load measurements
  const loadMeasurements = useCallback(async () => {
    if (!bidId) return;
    const res = await fetch(`/api/atlasbid/bid-measurements?bid_id=${bidId}`, { cache: "no-store" });
    const j = await res.json();
    setMeasurements(Array.isArray(j?.rows) ? j.rows : []);
  }, [bidId]);

  useEffect(() => { loadMeasurements(); }, [loadMeasurements]);

  // Init map
  useEffect(() => {
    if (!mapsLoaded || !mapDivRef.current || mapReady) return;
    const g = window.google;
    if (!g?.maps) return;

    const map = new g.maps.Map(mapDivRef.current, {
      mapTypeId: "hybrid",
      tilt: 0,
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: g.maps.ControlPosition.BOTTOM_LEFT,
        mapTypeIds: ["hybrid", "satellite", "roadmap"],
      },
      fullscreenControl: true,
      streetViewControl: false,
      zoomControl: true,
    });

    mapRef.current = map;
    infoWindowRef.current = new g.maps.InfoWindow();

    const dm = new g.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false, // we use our own buttons
      polygonOptions: {
        strokeColor: SHAPE_COLORS[0],
        fillColor: SHAPE_COLORS[0],
        fillOpacity: 0.25,
        strokeWeight: 2,
        editable: true,
        clickable: true,
      },
      polylineOptions: {
        strokeColor: SHAPE_COLORS[0],
        strokeWeight: 3,
        editable: true,
        clickable: true,
      },
    });
    dm.setMap(map);
    dmRef.current = dm;

    g.maps.event.addListener(dm, "overlaycomplete", (e: google.maps.drawing.OverlayCompleteEvent) => {
      dm.setDrawingMode(null);
      setDrawMode(null);
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

      setPendingShape({ overlay: e.overlay as any, shape_type: type, computed_value, unit });
      setPendingLabel("");
    });

    setMapReady(true);
  }, [mapsLoaded, mapReady]);

  // Geocode + fetch building outline
  useEffect(() => {
    if (!mapReady || !mapRef.current || !bid) return;
    const g = window.google;
    if (!g?.maps) return;
    const addressStr = [bid.address1 ?? bid.address, bid.city, bid.state, bid.zip].filter(Boolean).join(", ");
    if (!addressStr) return;

    const geocoder = new g.maps.Geocoder();
    geocoder.geocode({ address: addressStr }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const pos = results[0].geometry.location;
        mapRef.current!.setCenter(pos);
        mapRef.current!.setZoom(20);
        const latLng = { lat: pos.lat(), lng: pos.lng() };
        setGeocodedPos(latLng);

        // Fetch building outline from OpenStreetMap
        fetchBuildingOutline(latLng.lat, latLng.lng);
      }
    });
  }, [mapReady, bid]);

  async function fetchBuildingOutline(lat: number, lng: number) {
    try {
      const query = `[out:json];(way(around:60,${lat},${lng})["building"];relation(around:60,${lat},${lng})["building"];);out geom;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      const g = window.google;
      if (!g?.maps || !mapRef.current) return;

      const elements = json?.elements ?? [];
      if (elements.length === 0) return;

      for (const el of elements) {
        if (!el.geometry || el.geometry.length < 3) continue;
        const path = el.geometry.map((pt: { lat: number; lon: number }) => ({
          lat: pt.lat,
          lng: pt.lon,
        }));
        const poly = new g.maps.Polygon({
          map: mapRef.current,
          paths: path,
          strokeColor: "#facc15",
          strokeWeight: 2,
          strokeOpacity: 0.9,
          fillColor: "#facc15",
          fillOpacity: 0.08,
          clickable: false,
          zIndex: 1,
        });
        buildingOverlaysRef.current.push(poly);
      }
      setBuildingLoaded(true);
    } catch {
      // OSM may be unavailable — silently skip
    }
  }

  // Restore saved shapes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = window.google;
    if (!g?.maps) return;
    measurements.forEach((m) => {
      if (!shapesRef.current.has(m.id)) {
        addShapeToMap(m);
      }
    });
  }, [mapReady, measurements]);

  function getNextColor() {
    const color = SHAPE_COLORS[colorIndexRef.current % SHAPE_COLORS.length];
    colorIndexRef.current++;
    return color;
  }

  function addShapeToMap(m: MeasurementRow) {
    const g = window.google;
    if (!g?.maps || !mapRef.current) return;

    const color = SHAPE_COLORS[shapesRef.current.size % SHAPE_COLORS.length];
    let overlay: google.maps.Polygon | google.maps.Polyline;
    let labelPos: { lat: number; lng: number };

    if (m.shape_type === "polygon") {
      overlay = new g.maps.Polygon({
        map: mapRef.current,
        paths: m.path,
        strokeColor: color,
        fillColor: color,
        fillOpacity: 0.25,
        strokeWeight: 2,
        editable: false,
        zIndex: 2,
      });
      labelPos = computeCentroid(m.path);
    } else {
      overlay = new g.maps.Polyline({
        map: mapRef.current,
        path: m.path,
        strokeColor: color,
        strokeWeight: 3,
        editable: false,
        zIndex: 2,
      });
      labelPos = computeMidpoint(m.path);
    }

    const shortVal = m.unit === "sqft"
      ? `${m.computed_value.toLocaleString()} sf`
      : `${m.computed_value.toLocaleString()} lf`;

    const labelMarker = makeMapLabel(g, labelPos, shortVal, color);
    labelMarker.setMap(mapRef.current);

    g.maps.event.addListener(overlay, "click", (ev: google.maps.MapMouseEvent) => {
      if (infoWindowRef.current && ev.latLng) {
        infoWindowRef.current.setContent(
          `<div style="font-size:13px;font-weight:600;padding:2px 4px">${m.label}<br/><span style="font-weight:400;color:#555">${formatValue(m.computed_value, m.unit)}</span></div>`
        );
        infoWindowRef.current.setPosition(ev.latLng);
        infoWindowRef.current.open(mapRef.current!);
      }
      setHighlightedId(m.id);
    });

    shapesRef.current.set(m.id, { overlay, label: labelMarker });
  }

  function removeShapeFromMap(id: string) {
    const entry = shapesRef.current.get(id);
    if (entry) {
      entry.overlay.setMap(null);
      entry.label.setMap(null);
      shapesRef.current.delete(id);
    }
  }

  function highlightShape(id: string) {
    const g = window.google;
    if (!g?.maps || !mapRef.current) return;
    setHighlightedId(id);

    const entry = shapesRef.current.get(id);
    if (!entry) return;

    const m = measurements.find((r) => r.id === id);
    if (!m) return;

    // Pan map to measurement
    const pos = m.shape_type === "polygon" ? computeCentroid(m.path) : computeMidpoint(m.path);
    mapRef.current.panTo(pos);

    // Flash highlight
    const overlay = entry.overlay;
    const isFill = m.shape_type === "polygon";
    let flashes = 0;
    const interval = setInterval(() => {
      flashes++;
      const bright = flashes % 2 === 0;
      if (isFill) {
        (overlay as google.maps.Polygon).setOptions({ fillOpacity: bright ? 0.25 : 0.6 });
      } else {
        (overlay as google.maps.Polyline).setOptions({ strokeWeight: bright ? 3 : 6 });
      }
      if (flashes >= 6) {
        clearInterval(interval);
        if (isFill) (overlay as google.maps.Polygon).setOptions({ fillOpacity: 0.25 });
        else (overlay as google.maps.Polyline).setOptions({ strokeWeight: 3 });
      }
    }, 200);
  }

  function activateDrawMode(mode: "polygon" | "polyline") {
    const g = window.google;
    if (!g?.maps || !dmRef.current) return;
    const overlayType = mode === "polygon"
      ? g.maps.drawing.OverlayType.POLYGON
      : g.maps.drawing.OverlayType.POLYLINE;

    const color = SHAPE_COLORS[shapesRef.current.size % SHAPE_COLORS.length];
    dmRef.current.setOptions({
      polygonOptions: { strokeColor: color, fillColor: color, fillOpacity: 0.25, strokeWeight: 2, editable: true },
      polylineOptions: { strokeColor: color, strokeWeight: 3, editable: true },
    });
    dmRef.current.setDrawingMode(overlayType);
    setDrawMode(mode);
  }

  function cancelDraw() {
    if (dmRef.current) dmRef.current.setDrawingMode(null);
    setDrawMode(null);
    if (pendingShape) {
      pendingShape.overlay.setMap(null);
      setPendingShape(null);
      setPendingLabel("");
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

    // Remove pending overlay and add proper colored shape
    overlay.setMap(null);
    setMeasurements((prev) => {
      const next = [...prev, saved];
      return next;
    });

    // addShapeToMap will be called by the useEffect watching measurements
    setPendingShape(null);
    setPendingLabel("");
    setSaving(false);
  }

  async function deleteMeasurement(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/atlasbid/bid-measurements/${id}`, { method: "DELETE" });
    if (res.ok) {
      removeShapeFromMap(id);
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

  function fitToProperty() {
    if (!mapRef.current) return;
    const g = window.google;
    if (!g?.maps) return;

    if (measurements.length === 0 && geocodedPos) {
      mapRef.current.setCenter(geocodedPos);
      mapRef.current.setZoom(20);
      return;
    }

    const bounds = new g.maps.LatLngBounds();
    measurements.forEach((m) => m.path.forEach((p) => bounds.extend(p)));
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 40);
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

      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0d2616]">Property Measurements</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Draw areas and lengths on the satellite map. Measurements auto-fill bundle fields in Scope.
              {buildingLoaded && <span className="ml-1 text-yellow-600 font-medium">· Building outline loaded</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {measurements.length > 0 && (
              <>
                {totalSqft > 0 && (
                  <span className="bg-green-50 text-green-800 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
                    {totalSqft.toLocaleString()} sqft
                  </span>
                )}
                {totalLf > 0 && (
                  <span className="bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
                    {totalLf.toLocaleString()} lf
                  </span>
                )}
              </>
            )}
            <button
              onClick={fitToProperty}
              className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ⊙ Fit to Property
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="flex gap-4">
          {/* Map */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="rounded-xl overflow-hidden border border-[#d7e6db] shadow-sm" style={{ height: 520 }}>
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

            {/* Draw buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => drawMode === "polygon" ? cancelDraw() : activateDrawMode("polygon")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                  drawMode === "polygon"
                    ? "bg-green-700 text-white border-green-700 shadow-md"
                    : "bg-white border-gray-200 text-gray-700 hover:border-green-400 hover:text-green-700"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={drawMode === "polygon" ? "white" : "none"} stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 22 19 2 19" />
                </svg>
                {drawMode === "polygon" ? "Drawing area… (click map)" : "Draw Area (sqft)"}
              </button>
              <button
                onClick={() => drawMode === "polyline" ? cancelDraw() : activateDrawMode("polyline")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                  drawMode === "polyline"
                    ? "bg-blue-700 text-white border-blue-700 shadow-md"
                    : "bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:text-blue-700"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="3" y1="20" x2="21" y2="4" />
                </svg>
                {drawMode === "polyline" ? "Drawing length… (click map)" : "Draw Length (lf)"}
              </button>
              {(drawMode || pendingShape) && (
                <button
                  onClick={cancelDraw}
                  className="px-3 py-2.5 rounded-lg text-sm border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
              {drawMode && (
                <span className="text-xs text-gray-400 ml-1">
                  Click to place points · Double-click to finish
                </span>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-3">

            {/* Pending shape — label form */}
            {pendingShape && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📐</span>
                  <div>
                    <div className="text-sm font-bold text-amber-900">Shape drawn — name it</div>
                    <div className="text-xs text-amber-700 font-medium">
                      {formatValue(pendingShape.computed_value, pendingShape.unit)}
                      {" "}({pendingShape.shape_type === "polygon" ? "area" : "length"})
                    </div>
                  </div>
                </div>

                {/* Quick label presets */}
                <div className="flex flex-wrap gap-1">
                  {QUICK_LABELS.filter((l) =>
                    pendingShape.shape_type === "polyline"
                      ? ["Drainage", "Edging", "Natural Edge", "Walkway"].includes(l)
                      : !["Drainage", "Edging", "Natural Edge"].includes(l)
                  ).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setPendingLabel(l)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                        pendingLabel === l
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white border-amber-200 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <input
                  autoFocus
                  type="text"
                  placeholder="Or type a custom label…"
                  value={pendingLabel}
                  onChange={(e) => setPendingLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmSave(); if (e.key === "Escape") cancelDraw(); }}
                  className="border border-amber-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white placeholder-amber-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={confirmSave}
                    disabled={!pendingLabel.trim() || saving}
                    className="flex-1 bg-[#16a34a] text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-40 hover:bg-green-700 transition-colors"
                  >
                    {saving ? "Saving…" : "Save Measurement"}
                  </button>
                  <button
                    onClick={cancelDraw}
                    className="px-3 bg-white border border-gray-200 text-gray-500 text-sm font-semibold rounded-lg py-2 hover:bg-gray-50 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Measurements list */}
            <div className="bg-white border border-[#d7e6db] rounded-xl overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-[#d7e6db] flex items-center justify-between bg-gray-50/50">
                <span className="text-sm font-semibold text-[#0d2616]">Saved Measurements</span>
                {measurements.length > 0 && (
                  <span className="text-xs bg-green-100 text-green-800 font-semibold px-2 py-0.5 rounded-full">{measurements.length}</span>
                )}
              </div>

              {measurements.length === 0 && !pendingShape ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl mb-2">🗺️</div>
                  <p className="text-sm text-gray-500">No measurements yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Use the Draw buttons below the map.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#eef3ef] max-h-[380px] overflow-y-auto">
                  {measurements.map((m, idx) => {
                    const color = SHAPE_COLORS[idx % SHAPE_COLORS.length];
                    const isHighlighted = highlightedId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`px-3 py-2.5 space-y-1 cursor-pointer transition-colors ${isHighlighted ? "bg-green-50" : "hover:bg-gray-50/80"}`}
                        onClick={() => highlightShape(m.id)}
                      >
                        {renamingId === m.id ? (
                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              type="text"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveRename(m.id); if (e.key === "Escape") { setRenamingId(null); setRenameDraft(""); } }}
                              className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                            <button onClick={() => saveRename(m.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg">✓</button>
                            <button onClick={() => { setRenamingId(null); setRenameDraft(""); }} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">✕</button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: color }} />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-[#0d2616] truncate">{m.label}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.unit === "sqft" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                                    {m.unit === "sqft" ? "area" : "length"}
                                  </span>
                                  <span className="text-xs font-bold text-gray-700">
                                    {formatValue(m.computed_value, m.unit)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => { setRenamingId(m.id); setRenameDraft(m.label); }}
                                className="text-gray-300 hover:text-gray-500 p-1 rounded transition-colors"
                                title="Rename"
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854 2.146a.5.5 0 0 0-.707 0l-9 9A.5.5 0 0 0 3 11.5V14a.5.5 0 0 0 .5.5H6a.5.5 0 0 0 .354-.146l9-9a.5.5 0 0 0 0-.707l-2.5-2.5ZM4 11.707l8.5-8.5 1.293 1.293-8.5 8.5H4v-1.293Z"/></svg>
                              </button>
                              <button
                                onClick={() => deleteMeasurement(m.id)}
                                disabled={deletingId === m.id}
                                className="text-red-200 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-40"
                                title="Delete"
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2H5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-[#f6f8f6] border border-[#d7e6db] rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#0d2616]">Tips</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>🟡 <strong>Yellow outline</strong> = building footprint (OSM)</li>
                <li>🔷 <strong>Polygon</strong> → area in sqft / sqyd</li>
                <li>📏 <strong>Polyline</strong> → length in linear feet</li>
                <li>💡 Click a measurement in the list to highlight it on the map</li>
                <li>💡 Measurements auto-fill bundle fields in Scope</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
