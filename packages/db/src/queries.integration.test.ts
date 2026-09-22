/**
 * Integration tests against the local Supabase stack (T-106).
 *
 * These exercise the helpers as a real signed-in user, through PostgREST and
 * under RLS — which is the only way to catch an RPC argument name or return
 * shape that drifted from the migration. A type-level check would not.
 *
 * Skipped automatically when the stack is not running, so `pnpm test` stays
 * usable without Docker. CI's `database` job runs them for real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAnonClient, createServiceClient, type Db } from "./client";
import { createTask, getTaskByKey, listBoard, transitionTask, DbError } from "./queries";

// The local stack's keys are derived from a fixed demo JWT secret, so they are
// identical on every machine and in CI. Not secrets.
const URL = process.env["SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const ANON =
  process.env["SUPABASE_ANON_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function stackIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: ANON },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const up = await stackIsUp();

describe.skipIf(!up)("db helpers against the local stack", () => {
  const email = `db-test-${Date.now()}@example.com`;
  // tasks.key is globally unique while projects.key_prefix is unique only per
  // owner, so two users sharing a prefix would both allocate the same key and
  // collide.
  // v1 is single-user so this cannot happen in practice, but each test run
  // creates a fresh user — hence a fresh prefix too.
  const prefix = Array.from({ length: 6 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('');
  const password = "correct-horse-battery-staple";

  let service: Db;
  let user: Db;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    service = createServiceClient(URL, SERVICE);

    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    // Projects are created through the API in T-112; inserted directly here.
    const proj = await service
      .from("projects")
      .insert({
        owner_id: userId,
        name: "Integration",
        key_prefix: prefix,
        repo_owner: "o",
        repo_name: "r",
      })
      .select()
      .single();
    if (proj.error) throw proj.error;
    projectId = proj.data.id;

    // create_task reads auth.uid(), so it must run as the user, not the
    // service role — the service role has no uid at all.
    const signed = await createAnonClient(URL, ANON).auth.signInWithPassword({
      email,
      password,
    });
    if (signed.error) throw signed.error;
    user = createAnonClient(URL, ANON, signed.data.session.access_token);
  }, 30_000);

  afterAll(async () => {
    // tasks.owner_id references auth.users with no cascade, so the user cannot
    // be removed until its rows are. Deleting the project cascades to tasks.
    if (projectId) await service.from('projects').delete().eq('id', projectId);
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  it("allocates keys from the project prefix", async () => {
    const first = await createTask(user, { projectId, title: "first" });
    const second = await createTask(user, { projectId, title: "second" });

    expect(first.key).toBe(`${prefix}-1`);
    expect(second.key).toBe(`${prefix}-2`);
    expect(first.state).toBe("draft");
  });

  it("passes optional arguments through to the RPC", async () => {
    const t = await createTask(user, {
      projectId,
      title: "with options",
      description: "a description",
      priority: 0,
      labels: ["urgent", "backend"],
    });

    expect(t.description).toBe("a description");
    expect(t.priority).toBe(0);
    expect(t.labels).toEqual(["urgent", "backend"]);
  });

  it("finds a task by key, and returns null for one that does not exist", async () => {
    const found = await getTaskByKey(user, `${prefix}-1`);
    expect(found?.title).toBe("first");
    expect(await getTaskByKey(user, `${prefix}-9999`)).toBeNull();
  });

  it("transitions a task and reports the new state", async () => {
    const t = await createTask(user, { projectId, title: "to refine" });
    const moved = await transitionTask(user, {
      taskId: t.id,
      to: "refining",
      actor: "user",
    });
    expect(moved.state).toBe("refining");
  });

  it("surfaces an illegal transition as a DbError carrying P0001", async () => {
    const t = await createTask(user, { projectId, title: "illegal" });
    await expect(
      transitionTask(user, { taskId: t.id, to: "done", actor: "user" }),
    ).rejects.toMatchObject({ name: "DbError", code: "P0001" });
  });

  it("refuses to let a signed-in user act as an agent", async () => {
    const t = await createTask(user, { projectId, title: "escalation" });
    await expect(
      transitionTask(user, {
        taskId: t.id,
        to: "refining",
        actor: "agent",
      }),
    ).rejects.toBeInstanceOf(DbError);
  });

  it("lists the board and hides cancelled tasks unless asked", async () => {
    const doomed = await createTask(user, { projectId, title: "doomed" });
    await transitionTask(user, {
      taskId: doomed.id,
      to: "cancelled",
      actor: "user",
    });

    const visible = await listBoard(user, projectId);
    const all = await listBoard(user, projectId, { includeCancelled: true });

    expect(visible.some((t) => t.id === doomed.id)).toBe(false);
    expect(all.some((t) => t.id === doomed.id)).toBe(true);
    expect(all.length).toBeGreaterThan(visible.length);
  });
});

describe("createServiceClient", () => {
  it("refuses to run in a browser-like environment", () => {
    // The service role bypasses RLS, so a bundling mistake must crash loudly
    // rather than silently ship the key.
    (globalThis as Record<string, unknown>)["window"] = {};
    try {
      expect(() => createServiceClient(URL, SERVICE)).toThrow(/never reach client code/);
    } finally {
      delete (globalThis as Record<string, unknown>)["window"];
    }
  });
});
