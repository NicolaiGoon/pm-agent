/** Queue message shapes (LLD §5). Messages carry only ids — handlers reload
 *  fresh state from the database and exit early if the task has moved on. */
import { z } from "zod";

export const RefineJob = z.object({
  type: z.literal("refine"),
  taskId: z.uuid(),
  requestedAt: z.iso.datetime({ offset: true }),
});

export const ImplementJob = z.object({
  type: z.literal("implement"),
  taskId: z.uuid(),
  specId: z.uuid(),
});

export const AddressReviewJob = z.object({
  type: z.literal("address_review"),
  taskId: z.uuid(),
  reviewId: z.number().int(),
  prNumber: z.number().int(),
});

export const JobMessage = z.discriminatedUnion("type", [
  RefineJob,
  ImplementJob,
  AddressReviewJob,
]);

export type JobMessage = z.infer<typeof JobMessage>;
export type JobType = JobMessage["type"];

/** Which queue each job type is consumed from. */
export const QUEUE_NAMES = {
  refine: "q_refine",
  implement: "q_implement",
  refine_dlq: "q_refine_dlq",
  implement_dlq: "q_implement_dlq",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function queueForJob(type: JobType): QueueName {
  return type === "refine" ? QUEUE_NAMES.refine : QUEUE_NAMES.implement;
}
