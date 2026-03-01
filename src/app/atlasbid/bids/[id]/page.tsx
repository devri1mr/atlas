import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default function Page({
  params,
}: {
  params: { id: string };
}) {
  if (!params?.id) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>
          Invalid bid id. This page must be opened at
          /atlasbid/bids/&lt;uuid&gt;
        </div>
      </div>
    );
  }

  return <BidDetailClient bidId={params.id} />;
}
