/**
 * Supabase client factories (LLD §3, §11).
 *
 * Two clients with very different powers:
 *
 * - the anon client acts as the signed-in user and is subject to RLS, so it is
 *   what the browser and any request handler acting on the user's behalf use;
 * - the service-role client bypasses RLS entirely. Only the orchestrator, the
 *   agents' run recorder and the webhook handler use it, and it must never
 *   reach the browser bundle.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;

/** A client bound to a user's session. Every query runs under RLS. */
export function createAnonClient(
  url: string,
  anonKey: string,
  accessToken?: string,
): Db {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

/**
 * A client that bypasses RLS. Server-only.
 *
 * The runtime guard below is deliberate. `SUPABASE_SERVICE_ROLE_KEY` is not
 * prefixed with NEXT_PUBLIC_, so bundling this into client code would normally
 * fail at the point the key comes back undefined — which reads as a config
 * problem rather than what it is. Throwing on sight of `window` turns a silent
 * privilege leak into an obvious crash during development.
 */
export function createServiceClient(url: string, serviceRoleKey: string): Db {
  // Checked via globalThis rather than a bare `window` so this package needs
  // no DOM lib — which would also let browser-only APIs slip into shared code.
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    throw new Error(
      "createServiceClient() was called in the browser. The service role key " +
        "bypasses row level security and must never reach client code. Use " +
        "createAnonClient() instead.",
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
