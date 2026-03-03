// src/app/atlasbid/bids/[id]/page.tsx
import BidDetailClient from "./BidDetailClient";

export default function Page({ params }: { params: { id: string } }) {
  return <BidDetailClient bidId={params.id} />;
}
