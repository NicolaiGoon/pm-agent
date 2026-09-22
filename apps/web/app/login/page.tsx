import { signInWithGitHub } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">pm-agent</h1>
        <p className="text-sm text-muted-foreground">
          Write a task, approve the spec, review the pull request.
        </p>
      </div>

      <form action={signInWithGitHub}>
        <input type="hidden" name="next" value={next ?? "/"} />
        <Button type="submit" className="w-full">
          Sign in with GitHub
        </Button>
      </form>
    </main>
  );
}
