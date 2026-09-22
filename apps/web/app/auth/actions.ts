/** Auth server actions (T-107). */
"use server";

import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** Send the visitor back to /login with a message, keeping their destination. */
function backToLogin(message: string, next: string): never {
  redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  return { email, password, next };
}

/**
 * Email and password sign-in — the default Supabase provider.
 *
 * The system is single-user, so the identity provider is a convenience rather
 * than an architectural choice. GitHub OAuth (below) is the eventual default
 * per HLD §Security; this keeps the board usable before that is configured.
 */
export async function signIn(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) backToLogin("Enter an email and password.", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately vague: distinguishing "no such user" from "wrong password"
  // tells an attacker which emails are registered.
  if (error) backToLogin("Those credentials did not work.", next);

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) backToLogin("Enter an email and password.", next);
  if (password.length < 6) {
    backToLogin("Use a password of at least 6 characters.", next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) backToLogin(error.message, next);

  // Local development has email confirmation off, so sign-up returns a session
  // straight away. With confirmations on there would be no session yet and the
  // visitor would need to click a link first.
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    backToLogin("Check your email to confirm the account, then sign in.", next);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

/**
 * Start the GitHub OAuth flow.
 *
 * Only reachable when NEXT_PUBLIC_GITHUB_AUTH_ENABLED is set, which should
 * track [auth.external.github].enabled in supabase/config.toml.
 */
export async function signInWithGitHub(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const origin = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/auth/auth-code-error?reason=${encodeURIComponent(error.message)}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
