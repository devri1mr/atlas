import BidDetailClient from "./BidDetailClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <BidDetailClient bidId={id} />;
}
