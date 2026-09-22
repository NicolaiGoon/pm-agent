/**
 * Session-aware Supabase clients for server code (T-107, LLD §10).
 *
 * These read and write the auth cookies, so every query runs as the signed-in
 * user under RLS. For the service-role client, which bypasses RLS, see
 * lib/db.ts — the two are kept apart on purpose.
 */
import "server-only";

import type { Database } from "@pm/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in (LLD §11).`,
    );
  }
  return value;
}

/**
 * A client for server components, route handlers and server actions.
 *
 * Server components cannot set cookies, so the write path is allowed to fail
 * silently there. Session refresh still happens in proxy.ts, which can write,
 * so a token refreshed during a render is not lost.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component. proxy.ts refreshes the session
            // on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/** The signed-in user, or null. Never trust a cookie without this check. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
