"use client";

import { useEffect, useState } from "react";

export const PRESET_UNITS = [
  { label: "ea", value: "ea" },
  { label: "yd(s)", value: "yd" },
  { label: "sq ft", value: "sqft" },
  { label: "lin ft", value: "lf" },
  { label: "ft", value: "ft" },
  { label: "sticks", value: "stick" },
  { label: "tons", value: "ton" },
  { label: "loads", value: "load" },
  { label: "hours", value: "hr" },
  { label: "bag(s)", value: "bag" },
  { label: "lb(s)", value: "lb" },
  { label: "gal(s)", value: "gal" },
  { label: "rolls", value: "roll" },
  { label: "flat", value: "flat" },
  { label: "sf", value: "sf" },
  { label: "lft", value: "lft" },
  { label: "visit(s)", value: "visit" },
];

export default function UnitInput({
  value,
  onChange,
  className,
  disabled,
  allowBlank,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  allowBlank?: boolean;
}) {
  const isPreset = PRESET_UNITS.some((u) => u.value === value);
  const [showCustom, setShowCustom] = useState(!isPreset && value !== "");

  useEffect(() => {
    const preset = PRESET_UNITS.some((u) => u.value === value);
    if (!preset && value !== "") setShowCustom(true);
    else if (preset || value === "") setShowCustom(false);
  }, [value]);

  if (showCustom) {
    return (
      <div className="flex items-center gap-1 w-full">
        <input
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="unit"
          autoFocus
          disabled={disabled}
        />
        {!disabled && (
          <button
            type="button"
            title="Back to list"
            onClick={() => { setShowCustom(false); onChange("ea"); }}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xs leading-none"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setShowCustom(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      disabled={disabled}
    >
      {allowBlank && <option value="">—</option>}
      {PRESET_UNITS.map((u) => (
        <option key={u.value} value={u.value}>{u.label}</option>
      ))}
      {!disabled && (
        <>
          <option disabled>──────</option>
          <option value="__custom__">Other…</option>
        </>
      )}
    </select>
  );
}
