import Image from "next/image";

export default function AtlasOpsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-10 md:py-14">
        <div className="flex flex-col items-center justify-center gap-6 text-center">
          <Image src="/atlas-ops-logo.png" alt="Atlas Ops" width={200} height={200} className="object-contain" />
          <p className="text-sm text-emerald-900/60 max-w-sm">
            Select a division from the sidebar to view its operations dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
