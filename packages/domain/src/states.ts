/**
 * Task state machine (LLD §4).
 *
 * This is the TypeScript mirror of the `task_transitions` table seeded in the
 * schema migration. The database is the enforcer — every state change goes
 * through `transition_task()` — but the UI needs the same rules locally to know
 * which buttons to render. `states.parity.test.ts` asserts the two copies agree.
 */

export const TASK_STATES = [
  "draft",
  "refining",
  "awaiting_approval",
  "ready_to_pull",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const ACTOR_KINDS = ["user", "agent", "github", "system"] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface Transition {
  readonly from: TaskState;
  readonly to: TaskState;
  readonly actors: readonly ActorKind[];
}

/**
 * The 14 concrete transitions. Cancellation is deliberately absent: it is a
 * wildcard (any state except `done`/`cancelled`, by the user) and is handled by
 * `canCancel` here and by a special case inside `transition_task` in SQL, so it
 * gets no seed row.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: "draft", to: "refining", actors: ["user"] },
  { from: "refining", to: "awaiting_approval", actors: ["agent"] },
  { from: "refining", to: "blocked", actors: ["agent"] },
  { from: "awaiting_approval", to: "refining", actors: ["user"] },
  { from: "awaiting_approval", to: "ready_to_pull", actors: ["user"] },
  { from: "ready_to_pull", to: "in_progress", actors: ["agent"] },
  { from: "in_progress", to: "in_review", actors: ["github", "agent"] },
  { from: "in_progress", to: "blocked", actors: ["agent"] },
  { from: "in_progress", to: "ready_to_pull", actors: ["system"] },
  { from: "blocked", to: "ready_to_pull", actors: ["user"] },
  { from: "blocked", to: "refining", actors: ["user"] },
  { from: "in_review", to: "in_progress", actors: ["github"] },
  { from: "in_review", to: "done", actors: ["github"] },
  { from: "in_review", to: "blocked", actors: ["github"] },
] as const;

/** States from which nothing further can happen. */
export const TERMINAL_STATES: readonly TaskState[] = ["done", "cancelled"];

export function isTerminal(state: TaskState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** The cancel wildcard: a user may cancel anything not already finished. */
export function canCancel(from: TaskState, actor: ActorKind): boolean {
  return actor === "user" && !isTerminal(from);
}

export function canTransition(
  from: TaskState,
  to: TaskState,
  actor: ActorKind,
): boolean {
  if (to === "cancelled") return canCancel(from, actor);
  return TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.actors.includes(actor),
  );
}

/** Every state a given actor may move a task to from `from`. */
export function allowedTargets(
  from: TaskState,
  actor: ActorKind,
): readonly TaskState[] {
  const targets = TRANSITIONS.filter(
    (t) => t.from === from && t.actors.includes(actor),
  ).map((t) => t.to);
  return canCancel(from, actor) ? [...targets, "cancelled"] : targets;
}

/** Convenience for the UI: which transitions the signed-in user can trigger. */
export function userActions(from: TaskState): readonly TaskState[] {
  return allowedTargets(from, "user");
}
