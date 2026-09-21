/** Environment parsing (LLD §11). Parsed once at boot; the app refuses to start
 *  if a required variable is missing. Split so browser code can never pull in a
 *  schema that mentions a secret. */
import { z } from "zod";

/** Safe to evaluate in the browser bundle — public values only. */
export const BrowserEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type BrowserEnv = z.infer<typeof BrowserEnv>;

/** Server-only. Never import this from a client component. */
export const ServerEnv = BrowserEnv.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),

  GITHUB_APP_ID: z.string().min(1),
  /** base64-encoded PEM — see .env.example */
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),

  ORCHESTRATOR_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Written to tasks.locked_by. Defaults to the hostname at call sites. */
  WORKER_ID: z.string().min(1).optional(),
  SANDBOX_IMAGE: z.string().min(1),
});

export type ServerEnv = z.infer<typeof ServerEnv>;

/** Set on the deployed Edge Function, not in .env.local. */
export const EdgeFunctionEnv = z.object({
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type EdgeFunctionEnv = z.infer<typeof EdgeFunctionEnv>;

/**
 * Parse or die, with every missing/invalid variable named at once.
 *
 * `source` is required rather than defaulting to `process.env` so this package
 * stays free of any Node dependency (LLD §2: domain depends on zod, nothing else).
 * Server call sites pass `process.env`.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment. Check .env.local against .env.example:\n${issues}`,
    );
  }
  return result.data;
}
