/** Auth server actions (T-107). */
"use server";

import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/**
 * Start the GitHub OAuth flow.
 *
 * A server action rather than a client-side call so the redirect URL is built
 * from the request origin the server actually saw.
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
