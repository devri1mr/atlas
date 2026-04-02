import { notFound } from "next/navigation";

async function getShareData(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/share/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

const TAG_COLORS: Record<string, string> = {
  Before: "bg-blue-100 text-blue-800",
  During: "bg-yellow-100 text-yellow-800",
  After:  "bg-green-100 text-green-800",
  Issue:  "bg-red-100 text-red-800",
  Completed: "bg-purple-100 text-purple-800",
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getShareData(token);
  if (!data) notFound();

  const { bid, photos } = data as { bid: any; photos: any[] };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#123b1f] text-white px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <h1 className="text-xl font-bold">Site Photos</h1>
          </div>
          {bid && (
            <div className="text-white/70 text-sm">
              {bid.client_name && <span className="mr-3">{bid.client_name}</span>}
              {bid.address && <span className="mr-3">· {bid.address}</span>}
              {bid.created_at && <span>· {fmtDate(bid.created_at)}</span>}
            </div>
          )}
          <p className="text-white/50 text-xs mt-2">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Photo grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {photos.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No photos shared yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo: any) => (
              <div key={photo.id} className="group flex flex-col">
                <a href={photo.url} target="_blank" rel="noopener noreferrer"
                  className="block aspect-square rounded-xl overflow-hidden bg-gray-200 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  {photo.url
                    ? <img src={photo.url} alt={photo.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
                  }
                </a>
                {(photo.caption || (photo.tags?.length > 0)) && (
                  <div className="mt-1.5 px-0.5">
                    {photo.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {photo.tags.map((tag: string) => (
                          <span key={tag} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TAG_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {photo.caption && <p className="text-xs text-gray-600 leading-tight">{photo.caption}</p>}
                  </div>
                )}
                {photo.lat && photo.lng && (
                  <a href={`https://maps.google.com/?q=${photo.lat},${photo.lng}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:underline mt-0.5 px-0.5 flex items-center gap-1">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                    View on map
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-gray-300 text-xs mt-12">
          Powered by Atlas · This link was shared by your service provider
        </p>
      </div>
    </div>
  );
}
