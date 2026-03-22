import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Simple proxy so canvas can draw cross-origin Supabase images without tainting
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  try {
    const res = await fetch(url);
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
