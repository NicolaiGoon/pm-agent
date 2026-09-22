import { signIn, signInWithGitHub, signUp } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

/**
 * Email and password is the default provider. GitHub OAuth appears only when
 * it has been configured, so the button is never shown in a state where
 * clicking it would fail.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const githubEnabled = process.env["NEXT_PUBLIC_GITHUB_AUTH_ENABLED"] === "true";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">pm-agent</h1>
        <p className="text-sm text-muted-foreground">
          Write a task, approve the spec, review the pull request.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <form className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? "/"} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="current-password"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <div className="flex gap-2">
          <Button type="submit" formAction={signIn} className="flex-1">
            Sign in
          </Button>
          <Button
            type="submit"
            formAction={signUp}
            variant="outline"
            className="flex-1"
          >
            Create account
          </Button>
        </div>
      </form>

      {githubEnabled ? (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={signInWithGitHub}>
            <input type="hidden" name="next" value={next ?? "/"} />
            <Button type="submit" variant="outline" className="w-full">
              Sign in with GitHub
            </Button>
          </form>
        </>
      ) : null}
    </main>
  );
}
