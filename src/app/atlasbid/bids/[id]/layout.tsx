import Link from "next/link";

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
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-[#123b1f]">AtlasBid</h1>
          <div className="mt-1 text-sm text-[#3d5a45]">Bid ID: {id}</div>
        </div>

        {/* Tabs */}
        <div className="mb-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="cursor-pointer rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
              >
                {t.name}
              </Link>
            ))}
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
