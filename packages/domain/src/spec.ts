/** Agent output schemas. Both are validated before anything reaches the
 *  database or drives a state change (LLD §7.1, §7.2). */
import { z } from "zod";

/** Stored in `task_specs.content`. Produced by the refinement agent. */
export const RefinementOutput = z.object({
  summary: z.string().max(600),
  acceptanceCriteria: z.array(z.string()).min(1).max(15),
  approach: z.string(), // markdown
  techSuggestions: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      rationale: z.string(),
      alternatives: z.array(z.string()),
      isNewDependency: z.boolean(),
    }),
  ),
  affectedFiles: z.array(
    z.object({
      path: z.string(),
      change: z.enum(["add", "modify", "delete"]),
      note: z.string(),
    }),
  ),
  testPlan: z.array(z.string()),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  estimate: z.enum(["S", "M", "L"]),
});

export type RefinementOutput = z.infer<typeof RefinementOutput>;

/** Written by the implementation agent to /workspace/.agent/result.json. */
export const ImplementationResult = z.object({
  status: z.enum(["done", "blocked"]),
  summary: z.string(),
  checklist: z.array(
    z.object({
      criterion: z.string(),
      met: z.boolean(),
      evidence: z.string(),
    }),
  ),
  question: z.string().optional(),
});

export type ImplementationResult = z.infer<typeof ImplementationResult>;

/**
 * Dependencies the agent is permitted to add, drawn from the approved spec.
 * The sandbox permission hook (T-303) denies lockfile changes unless the new
 * package appears here.
 */
export function allowedNewDependencies(spec: RefinementOutput): string[] {
  return spec.techSuggestions
    .filter((t) => t.isNewDependency)
    .map((t) => t.name);
}
