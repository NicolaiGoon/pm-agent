import { getUser } from "@/lib/supabase/server";

/** Placeholder until the board lands in T-109. */
export default async function Home() {
  const user = await getUser();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold">Board</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {user?.email ?? "unknown"}. The board arrives in T-109.
      </p>
    </main>
  );
}
