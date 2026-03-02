import Link from "next/link";

export default async function BidScopePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#123b1f]">Scope</h2>
      <p className="mt-2 text-sm text-[#3d5a45]">
        Labor + materials builder will live here.
      </p>

      <div className="mt-6 rounded-md border border-[#d7e6db] bg-[#f6f8f6] p-4 text-sm text-[#123b1f]">
        Bid: <strong>{id}</strong>
      </div>

      <div className="mt-6">
        <Link
          href={`/atlasbid/bids/${id}`}
          className="cursor-pointer text-sm font-medium text-[#1e7a3a] hover:underline"
        >
          ← Back to Overview
        </Link>
      </div>
    </div>
  );
}
