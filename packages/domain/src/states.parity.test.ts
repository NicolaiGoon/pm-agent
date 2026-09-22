/**
 * SQL/TS parity (T-105).
 *
 * TRANSITIONS in states.ts mirrors the task_transitions seed so the UI can tell
 * which buttons to show without a round trip. Two copies of one rule drift, and
 * the drift is invisible: the database keeps enforcing the truth while the UI
 * quietly offers, or hides, the wrong buttons. This test reads the seed out of
 * the migration and fails if the copies disagree in either direction.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTOR_KINDS, TASK_STATES, TRANSITIONS } from "./states";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

interface SqlRow {
  from: string;
  to: string;
  actors: string[];
}

/** Pull the seeded rows out of whichever migration inserts them. */
function readSeed(): { file: string; rows: SqlRow[] } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const start = sql.indexOf("insert into task_transitions");
    if (start === -1) continue;

    // The statement ends at the first semicolon after the VALUES list.
    const end = sql.indexOf(";", start);
    const block = sql.slice(start, end === -1 ? undefined : end);

    const rows: SqlRow[] = [];
    const re = /\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'\{([a-z_,]+)\}'\s*\)/g;
    for (const m of block.matchAll(re)) {
      rows.push({
        from: m[1]!,
        to: m[2]!,
        actors: m[3]!.split(",").map((a) => a.trim()),
      });
    }
    return { file, rows };
  }
  throw new Error(
    `No migration in ${MIGRATIONS_DIR} seeds task_transitions. If the seed moved, update this test.`,
  );
}

const key = (r: { from: string; to: string; actors: readonly string[] }) =>
  `${r.from} -> ${r.to} [${[...r.actors].sort().join(",")}]`;

describe("task_transitions seed matches TRANSITIONS", () => {
  const { file, rows } = readSeed();

  it(`finds the seed (in ${file})`, () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("seeds exactly as many rows as the TypeScript table", () => {
    expect(rows).toHaveLength(TRANSITIONS.length);
  });

  it("agrees row for row, including the actor lists", () => {
    const sql = rows.map(key).sort();
    const ts = TRANSITIONS.map(key).sort();
    expect(sql).toEqual(ts);
  });

  it("names only states and actors the enums declare", () => {
    for (const r of rows) {
      expect(TASK_STATES).toContain(r.from);
      expect(TASK_STATES).toContain(r.to);
      for (const a of r.actors) expect(ACTOR_KINDS).toContain(a);
    }
  });

  it("seeds no cancellation row — it is a wildcard handled in code", () => {
    // transition_task special-cases it, and canCancel does the same in TS.
    // A row here would mean one copy enumerates it and the other does not.
    expect(rows.filter((r) => r.to === "cancelled")).toEqual([]);
  });

  it("has no duplicate from/to pair, which would make the primary key fail", () => {
    const pairs = rows.map((r) => `${r.from}->${r.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});
