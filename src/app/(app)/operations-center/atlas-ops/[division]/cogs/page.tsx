import CogsDashboard from "@/components/ops/CogsDashboard";

type Props = { params: Promise<{ division: string }> };

export default async function DivisionCogsPage({ params }: Props) {
  const { division } = await params;
  const divisionLabel = division
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") + " Division";

  return (
    <CogsDashboard
      division={division}
      divisionLabel={divisionLabel}
      apiPath={`/api/operations-center/atlas-ops/${division}/cogs`}
    />
  );
}
