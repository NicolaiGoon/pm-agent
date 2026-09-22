/**
 * Supabase client for client components (T-107).
 *
 * Holds only the anon key and the user's session, never a service-role key
 * (LLD §11). Reads go straight from the browser to Supabase under RLS, which
 * is what makes Realtime subscriptions in T-111 safe.
 */
"use client";

import type { Database } from "@pm/db";
import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Memoised: one client per tab, so subscriptions are not duplicated. */
export function createClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
