/**
 * Server-side database access for the web app.
 *
 * Session-aware clients arrive in T-107 with @supabase/ssr; this is the part
 * that does not depend on auth — reading validated config once and handing out
 * the two clients from @pm/db.
 */
import "server-only";

import {
  createAnonClient,
  createServiceClient,
  type Db,
} from "@pm/db";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in (LLD §11).`,
    );
  }
  return value;
}

/**
 * A client acting as the signed-in user. Every query runs under RLS, so this
 * is safe for anything driven by a request.
 */
export function userDb(accessToken?: string): Db {
  return createAnonClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    accessToken,
  );
}

/**
 * A client that bypasses RLS. Only the orchestrator and the webhook handler
 * need it. `server-only` above makes importing this module from a client
 * component a build error rather than a runtime surprise.
 */
export function serviceDb(): Db {
  return createServiceClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
  );
}
