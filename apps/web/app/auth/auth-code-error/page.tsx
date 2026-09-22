import Link from "next/link";
// This Button is base-ui based and has no `asChild`; buttonVariants is the
// supported way to style a link like a button.
import { buttonVariants } from "@/components/ui/button";

export default async function AuthCodeError({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Could not sign you in</h1>
      <p className="text-sm text-muted-foreground">
        {reason
          ? `Supabase returned: ${reason}`
          : "The sign-in link was missing or had expired."}
      </p>
      <Link href="/login" className={buttonVariants()}>
        Try again
      </Link>
    </main>
  );
}
