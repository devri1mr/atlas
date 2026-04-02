import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_PATHS = [
  "/dashboard",
  "/atlasbid",
  "/atlastakeoff",
  "/atlasperformance",
  "/operations-center",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — this keeps the cookie alive
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from login page
  if (user && pathname === "/") {
    try {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("permissions")
        .eq("email", user.email!)
        .single();
      const perms = (profile?.permissions ?? {}) as Record<string, boolean>;
      const dest = perms.dashboard === false
        ? "/operations-center/atlas-ops/lawn/digest"
        : "/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    } catch {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Redirect unauthenticated users away from app pages
  const isAppPath = APP_PATHS.some(p => pathname.startsWith(p));
  if (!user && isAppPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|.*\\.webp|api/).*)",
  ],
};
