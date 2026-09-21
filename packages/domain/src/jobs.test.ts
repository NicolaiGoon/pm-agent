import { describe, expect, it } from "vitest";
import { JobMessage, QUEUE_NAMES, queueForJob } from "./jobs";

const uuid = "3f1b7c2e-8a4d-4f6b-9c1e-2d5a7b8c9e0f";
const uuid2 = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("JobMessage", () => {
  it("accepts a refine job", () => {
    const r = JobMessage.safeParse({
      type: "refine",
      taskId: uuid,
      requestedAt: "2026-09-21T10:00:00Z",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an implement job", () => {
    const r = JobMessage.safeParse({
      type: "implement",
      taskId: uuid,
      specId: uuid2,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an address_review job", () => {
    const r = JobMessage.safeParse({
      type: "address_review",
      taskId: uuid,
      reviewId: 12345,
      prNumber: 7,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown job type", () => {
    expect(JobMessage.safeParse({ type: "deploy", taskId: uuid }).success).toBe(
      false,
    );
  });

  it("rejects a malformed uuid — a bad message must go to the DLQ, not run", () => {
    const r = JobMessage.safeParse({
      type: "implement",
      taskId: "not-a-uuid",
      specId: uuid2,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an implement job with no specId, so approval cannot be bypassed", () => {
    expect(
      JobMessage.safeParse({ type: "implement", taskId: uuid }).success,
    ).toBe(false);
  });

  it("rejects a non-integer prNumber", () => {
    const r = JobMessage.safeParse({
      type: "address_review",
      taskId: uuid,
      reviewId: 1,
      prNumber: 2.5,
    });
    expect(r.success).toBe(false);
  });
});

describe("queueForJob", () => {
  it("sends refinement to the fast queue and the rest to the slow one", () => {
    expect(queueForJob("refine")).toBe(QUEUE_NAMES.refine);
    expect(queueForJob("implement")).toBe(QUEUE_NAMES.implement);
    expect(queueForJob("address_review")).toBe(QUEUE_NAMES.implement);
  });
});
