/**
 * Session refresh and route protection (T-107).
 *
 * Next 16 renamed the `middleware` convention to `proxy`; the task text says
 * middleware.ts because the LLD predates that. Same behaviour, new name.
 *
 * Runs before every matched request: refreshes the auth token if it expired
 * and sends signed-out visitors to /login. Server components cannot write
 * cookies, so this is the one place a refreshed token gets persisted.
 */
import type { Database } from "@pm/db";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/auth-code-error"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() only decodes
  // the cookie, which a client could forge, so it must not gate access.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Come back to where they were aiming once signed in.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip static assets and images: they need no session and matching them
  // would run this on every file request.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
