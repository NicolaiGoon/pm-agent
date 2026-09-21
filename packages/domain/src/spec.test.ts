import { describe, expect, it } from "vitest";
import {
  ImplementationResult,
  RefinementOutput,
  allowedNewDependencies,
} from "./spec";

const validSpec = {
  summary: "Add a slugify utility.",
  acceptanceCriteria: ["slugify('A B') === 'a-b'"],
  approach: "## Approach\nAdd `src/slugify.ts`.",
  techSuggestions: [
    {
      name: "slugify",
      purpose: "string to url slug",
      rationale: "well tested",
      alternatives: ["hand-rolled"],
      isNewDependency: true,
    },
    {
      name: "vitest",
      purpose: "tests",
      rationale: "already present",
      alternatives: [],
      isNewDependency: false,
    },
  ],
  affectedFiles: [
    { path: "src/slugify.ts", change: "add", note: "new util" },
  ],
  testPlan: ["unit tests for slugify"],
  risks: [],
  openQuestions: [],
  estimate: "S",
};

describe("RefinementOutput", () => {
  it("accepts a well-formed spec", () => {
    expect(RefinementOutput.safeParse(validSpec).success).toBe(true);
  });

  it("requires at least one acceptance criterion", () => {
    const r = RefinementOutput.safeParse({
      ...validSpec,
      acceptanceCriteria: [],
    });
    expect(r.success).toBe(false);
  });

  it("caps acceptance criteria at 15 so specs stay reviewable", () => {
    const r = RefinementOutput.safeParse({
      ...validSpec,
      acceptanceCriteria: Array.from({ length: 16 }, (_, i) => `c${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown file change kind", () => {
    const r = RefinementOutput.safeParse({
      ...validSpec,
      affectedFiles: [{ path: "a.ts", change: "rename", note: "" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an estimate outside S/M/L", () => {
    expect(
      RefinementOutput.safeParse({ ...validSpec, estimate: "XL" }).success,
    ).toBe(false);
  });

  it("caps the summary at 600 characters", () => {
    const r = RefinementOutput.safeParse({
      ...validSpec,
      summary: "x".repeat(601),
    });
    expect(r.success).toBe(false);
  });
});

describe("allowedNewDependencies", () => {
  it("returns only suggestions flagged as new dependencies", () => {
    const spec = RefinementOutput.parse(validSpec);
    expect(allowedNewDependencies(spec)).toEqual(["slugify"]);
  });

  it("returns nothing when the spec adds no dependency", () => {
    const spec = RefinementOutput.parse({ ...validSpec, techSuggestions: [] });
    expect(allowedNewDependencies(spec)).toEqual([]);
  });
});

describe("ImplementationResult", () => {
  it("accepts a completed run", () => {
    const r = ImplementationResult.safeParse({
      status: "done",
      summary: "Added slugify.",
      checklist: [{ criterion: "slugify works", met: true, evidence: "test" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a blocked run carrying a question", () => {
    const r = ImplementationResult.safeParse({
      status: "blocked",
      summary: "Ambiguous requirement.",
      checklist: [],
      question: "Should empty input throw or return ''?",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a status outside done/blocked", () => {
    const r = ImplementationResult.safeParse({
      status: "partial",
      summary: "",
      checklist: [],
    });
    expect(r.success).toBe(false);
  });

  it("requires evidence on every checklist entry", () => {
    const r = ImplementationResult.safeParse({
      status: "done",
      summary: "x",
      checklist: [{ criterion: "c", met: true }],
    });
    expect(r.success).toBe(false);
  });
});
