import { describe, expect, it } from "vitest";
import {
  ACTOR_KINDS,
  TASK_STATES,
  TRANSITIONS,
  allowedTargets,
  canCancel,
  canTransition,
  isTerminal,
  userActions,
  type ActorKind,
  type TaskState,
} from "./states";

describe("TRANSITIONS", () => {
  it("has the 14 concrete rows from LLD §4", () => {
    expect(TRANSITIONS).toHaveLength(14);
  });

  it("never seeds a cancellation row (it is a wildcard)", () => {
    expect(TRANSITIONS.some((t) => t.to === "cancelled")).toBe(false);
  });

  it("only references known states and actors", () => {
    for (const t of TRANSITIONS) {
      expect(TASK_STATES).toContain(t.from);
      expect(TASK_STATES).toContain(t.to);
      for (const a of t.actors) expect(ACTOR_KINDS).toContain(a);
    }
  });

  it("has no duplicate from/to pairs", () => {
    const pairs = TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("leaves no terminal state with an outgoing transition", () => {
    for (const t of TRANSITIONS) expect(isTerminal(t.from)).toBe(false);
  });

  it("reaches every non-draft state from somewhere", () => {
    const reachable = new Set<TaskState>(TRANSITIONS.map((t) => t.to));
    reachable.add("cancelled"); // via the wildcard
    for (const s of TASK_STATES) {
      if (s === "draft") continue;
      expect(reachable).toContain(s);
    }
  });
});

describe("canTransition", () => {
  it("allows the happy path with its correct actor", () => {
    expect(canTransition("draft", "refining", "user")).toBe(true);
    expect(canTransition("refining", "awaiting_approval", "agent")).toBe(true);
    expect(canTransition("awaiting_approval", "ready_to_pull", "user")).toBe(true);
    expect(canTransition("ready_to_pull", "in_progress", "agent")).toBe(true);
    expect(canTransition("in_progress", "in_review", "github")).toBe(true);
    expect(canTransition("in_review", "done", "github")).toBe(true);
  });

  it("rejects the right actor on the wrong edge", () => {
    // Only the agent posts a spec; a user cannot skip refinement.
    expect(canTransition("refining", "awaiting_approval", "user")).toBe(false);
    // Only GitHub (via webhook) marks a PR merged.
    expect(canTransition("in_review", "done", "user")).toBe(false);
    // Only the sweeper releases a stale lock.
    expect(canTransition("in_progress", "ready_to_pull", "agent")).toBe(false);
    expect(canTransition("in_progress", "ready_to_pull", "system")).toBe(true);
  });

  it("rejects edges that do not exist at all", () => {
    expect(canTransition("draft", "done", "user")).toBe(false);
    expect(canTransition("draft", "in_progress", "agent")).toBe(false);
    expect(canTransition("done", "refining", "user")).toBe(false);
  });

  it("accepts in_progress -> in_review from either github or the agent fallback", () => {
    expect(canTransition("in_progress", "in_review", "github")).toBe(true);
    expect(canTransition("in_progress", "in_review", "agent")).toBe(true);
    expect(canTransition("in_progress", "in_review", "user")).toBe(false);
  });
});

describe("the cancel wildcard", () => {
  it("lets a user cancel from any non-terminal state", () => {
    for (const s of TASK_STATES) {
      if (isTerminal(s)) continue;
      expect(canCancel(s, "user")).toBe(true);
      expect(canTransition(s, "cancelled", "user")).toBe(true);
    }
  });

  it("refuses to cancel a finished task", () => {
    expect(canTransition("done", "cancelled", "user")).toBe(false);
    expect(canTransition("cancelled", "cancelled", "user")).toBe(false);
  });

  it("is reserved for the user — no agent, github or system actor may cancel", () => {
    const others: ActorKind[] = ["agent", "github", "system"];
    for (const actor of others) {
      for (const s of TASK_STATES) {
        expect(canTransition(s, "cancelled", actor)).toBe(false);
      }
    }
  });
});

describe("userActions", () => {
  it("offers exactly the documented buttons per state", () => {
    expect([...userActions("draft")].sort()).toEqual(["cancelled", "refining"]);
    expect([...userActions("awaiting_approval")].sort()).toEqual([
      "cancelled",
      "ready_to_pull",
      "refining",
    ]);
    expect([...userActions("blocked")].sort()).toEqual([
      "cancelled",
      "ready_to_pull",
      "refining",
    ]);
  });

  it("offers nothing on terminal states", () => {
    expect(userActions("done")).toEqual([]);
    expect(userActions("cancelled")).toEqual([]);
  });

  it("offers only cancel while an agent owns the task", () => {
    expect(userActions("refining")).toEqual(["cancelled"]);
    expect(userActions("in_progress")).toEqual(["cancelled"]);
    expect(userActions("ready_to_pull")).toEqual(["cancelled"]);
  });

  it("agrees with canTransition for every state", () => {
    for (const from of TASK_STATES) {
      for (const to of userActions(from)) {
        expect(canTransition(from, to, "user")).toBe(true);
      }
    }
  });
});

describe("allowedTargets", () => {
  it("matches canTransition across the whole matrix", () => {
    for (const from of TASK_STATES) {
      for (const actor of ACTOR_KINDS) {
        const targets = new Set(allowedTargets(from, actor));
        for (const to of TASK_STATES) {
          expect(canTransition(from, to, actor)).toBe(targets.has(to));
        }
      }
    }
  });
});
