import BidDetailClient from "./BidDetailClient";

export default function Page({ params }: { params: { id: string } }) {
  return <BidDetailClient id={params.id} />;
}
