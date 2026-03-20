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
    { name: "Photos", href: `/atlasbid/bids/${id}/photos` },
    { name: "Proposal", href: `/atlasbid/bids/${id}/proposal` },
  ];

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        {/* Hero header card: logo centered top, tabs pinned to bottom */}
        <div className="mb-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm flex flex-col items-center pt-6 pb-4 px-6 gap-4">
          <img
            src="/atlasbid-logo.png"
            alt="AtlasBid"
            className="h-72 w-auto object-contain"
          />
          <BidTabs tabs={tabs} />
        </div>

        {/* Page Content */}
        <div className="rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
