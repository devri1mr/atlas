type Props = { params: Promise<{ division: string }> };

export default async function AtlasOpsDivisionPage({ params }: Props) {
  const { division: divisionSlug } = await params;
  const divisionName = divisionSlug
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
        <div className="flex flex-col gap-1 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">{divisionName}</h1>
          <p className="text-sm text-emerald-900/60">Operations dashboard for {divisionName} division.</p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-white shadow-sm px-6 py-10 text-center">
          <p className="text-sm text-emerald-900/50">Coming soon — production reports and metrics for {divisionName}.</p>
        </div>
      </div>
    </div>
  );
}
