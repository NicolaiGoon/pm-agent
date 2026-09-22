import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/supabase/server";

export async function SiteHeader() {
  const user = await getUser();
  if (!user) return null;

  const label =
    (user.user_metadata["user_name"] as string | undefined) ??
    user.email ??
    "signed in";

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <span className="font-semibold tracking-tight">pm-agent</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
