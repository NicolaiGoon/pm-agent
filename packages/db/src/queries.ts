/**
 * Typed query helpers (T-106).
 *
 * Reads go straight from the browser to Supabase under RLS; only state changes
 * and anything needing a secret go through a route handler (LLD §10). These
 * helpers wrap both, so call sites never hand-write a table name or an RPC
 * argument object.
 */
import type { ActorKind, TaskState } from "@pm/domain";
import type { Db } from "./client";
import type { Json, Tables } from "./database.types";

export type Task = Tables<"tasks">;
export type Project = Tables<"projects">;
export type TaskSpec = Tables<"task_specs">;
export type AgentRun = Tables<"agent_runs">;
export type Comment = Tables<"comments">;
export type TaskEvent = Tables<"task_events">;
export type Settings = Tables<"settings">;

/** Keys transition_task accepts in its patch. Anything else is ignored by SQL. */
export interface TransitionPatch {
  branch?: string;
  pr_number?: number;
  pr_url?: string;
  current_spec_id?: string;
  locked_by?: string;
  /** Approval guard: fail with P0002 if the spec changed since it was read. */
  expected_spec_id?: string;
  review_id?: number;
}

/**
 * Postgres error codes this project raises deliberately. Route handlers map
 * these to HTTP status codes (LLD §10), so they are named rather than matched
 * as string literals at each call site.
 */
export const PG_ERRORS = {
  ILLEGAL_TRANSITION: "P0001",
  SPEC_CHANGED: "P0002",
  GUARDED_COLUMN: "P0003",
  SPEC_AFTER_APPROVAL: "P0004",
  NOT_FOUND: "P0005",
  NO_SPEC_TO_APPROVE: "P0006",
  INVALID_INPUT: "P0007",
  FORBIDDEN: "42501",
} as const;

export type PgErrorCode = (typeof PG_ERRORS)[keyof typeof PG_ERRORS];

/** Narrow a thrown Supabase error to one of the codes above. */
export function pgErrorCode(error: unknown): PgErrorCode | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return undefined;
  return (Object.values(PG_ERRORS) as string[]).includes(code)
    ? (code as PgErrorCode)
    : undefined;
}

/** Thrown by the helpers below so callers get one error shape to handle. */
export class DbError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.details = details;
  }
}

function fail(context: string, error: unknown): never {
  const e = error as { message?: string; code?: string; details?: string };
  throw new DbError(
    `${context}: ${e?.message ?? "unknown error"}`,
    e?.code,
    e?.details,
  );
}

// ---------------------------------------------------------------------------
// Writes — always through an RPC, never a direct update. The guard trigger
// rejects a direct state write anyway (P0003); these wrap the sanctioned route.
// ---------------------------------------------------------------------------

export async function createTask(
  db: Db,
  args: {
    projectId: string;
    title: string;
    description?: string;
    priority?: number;
    labels?: string[];
  },
): Promise<Task> {
  const { data, error } = await db
    .rpc("create_task", {
      p_project_id: args.projectId,
      p_title: args.title,
      ...(args.description !== undefined ? { p_description: args.description } : {}),
      ...(args.priority !== undefined ? { p_priority: args.priority } : {}),
      ...(args.labels !== undefined ? { p_labels: args.labels } : {}),
    })
    .single();

  if (error) fail("create_task", error);
  return data as Task;
}

export async function transitionTask(
  db: Db,
  args: {
    taskId: string;
    to: TaskState;
    actor: ActorKind;
    reason?: string;
    patch?: TransitionPatch;
  },
): Promise<Task> {
  const { data, error } = await db
    .rpc("transition_task", {
      p_task_id: args.taskId,
      p_to: args.to,
      p_actor: args.actor,
      ...(args.reason !== undefined ? { p_reason: args.reason } : {}),
      // TransitionPatch is a flat object of primitives, so it satisfies Json;
      // the cast tells TypeScript that without widening the public signature.
      ...(args.patch !== undefined ? { p_patch: args.patch as Json } : {}),
    })
    .single();

  if (error) fail("transition_task", error);
  return data as Task;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTaskByKey(db: Db, key: string): Promise<Task | null> {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  if (error) fail(`getTaskByKey(${key})`, error);
  return data;
}

/**
 * The board: every task in a project, ordered the way the columns render.
 * Cancelled tasks are excluded by default — the board hides them behind a
 * toggle (T-109).
 */
export async function listBoard(
  db: Db,
  projectId: string,
  opts: { includeCancelled?: boolean } = {},
): Promise<Task[]> {
  let q = db.from("tasks").select("*").eq("project_id", projectId);
  if (!opts.includeCancelled) q = q.neq("state", "cancelled");

  const { data, error } = await q
    .order("state", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) fail(`listBoard(${projectId})`, error);
  return data ?? [];
}

export async function listProjects(db: Db): Promise<Project[]> {
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) fail("listProjects", error);
  return data ?? [];
}

/** Spec versions for a task, newest first. */
export async function listSpecs(db: Db, taskId: string): Promise<TaskSpec[]> {
  const { data, error } = await db
    .from("task_specs")
    .select("*")
    .eq("task_id", taskId)
    .order("version", { ascending: false });

  if (error) fail(`listSpecs(${taskId})`, error);
  return data ?? [];
}

export async function listRuns(db: Db, taskId: string): Promise<AgentRun[]> {
  const { data, error } = await db
    .from("agent_runs")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) fail(`listRuns(${taskId})`, error);
  return data ?? [];
}

/** The audit trail for a task, oldest first, as the timeline renders it. */
export async function listEvents(db: Db, taskId: string): Promise<TaskEvent[]> {
  const { data, error } = await db
    .from("task_events")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) fail(`listEvents(${taskId})`, error);
  return data ?? [];
}

export async function getSettings(db: Db): Promise<Settings | null> {
  const { data, error } = await db.from("settings").select("*").maybeSingle();
  if (error) fail("getSettings", error);
  return data;
}
