export default function AtlasOpsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-10 md:py-14">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-700 flex items-center justify-center shadow-md">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950">Atlas Ops</h1>
          <p className="text-sm text-emerald-900/60 max-w-sm">
            Select a division from the sidebar to view its operations dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
