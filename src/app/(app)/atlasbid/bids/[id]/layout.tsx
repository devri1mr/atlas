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
    { name: "Measurements", href: `/atlasbid/bids/${id}/measurements` },
    { name: "Pricing", href: `/atlasbid/bids/${id}/pricing` },
    { name: "Photos/Videos", href: `/atlasbid/bids/${id}/photos` },
    { name: "Proposal", href: `/atlasbid/bids/${id}/proposal` },
  ];

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-3 sm:px-6 py-4 sm:py-6">
      <div className="mx-auto max-w-6xl">
        {/* Hero header card */}
        <div className="mb-4 sm:mb-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm flex flex-col items-center pt-4 sm:pt-6 pb-3 sm:pb-4 px-3 sm:px-6 gap-3 sm:gap-4">
          <img
            src="/atlasbid-logo.png"
            alt="AtlasBid"
            className="h-20 sm:h-40 md:h-56 w-auto object-contain"
          />
          <BidTabs tabs={tabs} />
        </div>

        {/* Page Content */}
        <div className="rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="p-3 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
