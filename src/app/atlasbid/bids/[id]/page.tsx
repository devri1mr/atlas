import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default function Page(props: any) {
  console.log("PAGE PROPS:", props);

  const id = props?.params?.id;

  if (!id) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>
          Invalid bid id. Debug: {JSON.stringify(props)}
        </div>
      </div>
    );
  }

  return <BidDetailClient bidId={id} />;
}
