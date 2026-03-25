"use client";

import { useUser } from "@/lib/userContext";

export default function AccessGate({
  permKey,
  children,
}: {
  permKey: string;
  children: React.ReactNode;
}) {
  const { loading, can } = useUser();

  // While loading, render nothing (middleware already validated auth; this is just permission check)
  if (loading) return null;

  if (!can(permKey)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          You don&apos;t have permission to view this page. Contact your administrator to request access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
