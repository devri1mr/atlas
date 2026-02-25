"use client";

import { useEffect, useState } from "react";

type Division = {
  id: number;
  name: string;
  is_active: boolean;
};

type Role = {
  id: number;
  name: string;
  is_active: boolean;
};

type Rate = {
  id: number;
  division_id: number;
  job_role_id: number;
  hourly_rate: number;
};

export default function LaborRatesClient() {
  const [rows, setRows] = useState<Rate[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/labor-rates", { cache: "no-store" });
    const data = await res.json();

    setRows(data.rows ?? []);
    setDivisions(data.divisions ?? []);
    setRoles(data.roles ?? []);
    setLoading(false);
  }

  function getDivisionName(id: number) {
    return divisions.find((d) => d.id === id)?.name ?? "—";
  }

  function getRoleName(id: number) {
    return roles.find((r) => r.id === id)?.name ?? "—";
  }

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Labor Rates</h1>

      <table className="w-full border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3">Division</th>
            <th className="text-left p-3">Role</th>
            <th className="text-left p-3">Hourly Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-3">{getDivisionName(r.division_id)}</td>
              <td className="p-3">{getRoleName(r.job_role_id)}</td>
              <td className="p-3">${r.hourly_rate.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}