// src/app/atlasbid/bids/[id]/page.tsx
import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  return <BidDetailClient id={params.id} />;
}
