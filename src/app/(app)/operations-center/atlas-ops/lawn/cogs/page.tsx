import CogsDashboard from "@/components/ops/CogsDashboard";

export default function LawnCogsPage() {
  return (
    <CogsDashboard
      division="lawn"
      divisionLabel="Lawn Division"
      apiPath="/api/operations-center/atlas-ops/lawn/cogs"
    />
  );
}
