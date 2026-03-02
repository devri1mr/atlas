import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <BidDetailClient bidId={params.id} />;
}
