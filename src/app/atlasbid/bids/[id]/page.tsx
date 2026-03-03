import BidDetailClient from "./BidDetailClient";

export default function ScopePage({
  params,
}: {
  params: { id: string };
}) {
  return <BidDetailClient bidId={params.id} />;
}
