// src/app/atlasbid/bids/[id]/layout.tsx
import BidTabs from "./BidTabs";

export default async function BidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tabs = [
    { name: "Overview", href: `/atlasbid/bids/${id}` },
    { name: "Scope", href: `/atlasbid/bids/${id}/scope` },
    { name: "Pricing", href: `/atlasbid/bids/${id}/pricing` },
    { name: "Proposal", href: `/atlasbid/bids/${id}/proposal` },
  ];

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        {/* Tabs left, logo right */}
        <div className="mb-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="flex items-center px-6 py-4 gap-6">
            <div className="shrink-0">
              <BidTabs tabs={tabs} />
            </div>
            <div className="flex-1 flex justify-end">
              <img
                src="/atlasbid-logo.png"
                alt="AtlasBid"
                className="h-52 w-auto object-contain"
                style={{ mixBlendMode: "multiply" }}
              />
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
