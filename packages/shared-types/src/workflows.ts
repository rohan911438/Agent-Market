import { z } from 'zod';

/**
 * The Orchestration Engine (Phase 12) — POST /v1/workflows/execute runs an
 * ordered sequence of first-party metered calls against one upfront
 * payment. See apps/api/src/services/workflow-executor.ts for the
 * architecture (why each step is settled from an internal escrow rather
 * than a real per-step payment) and apps/api/src/services/
 * workflow-templating.ts for the `{{steps[N].output...}}` reference syntax
 * usable in a later step's `params`.
 */
export const WorkflowStepInputSchema = z.object({
  resource: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowStepInput = z.infer<typeof WorkflowStepInputSchema>;

export const WorkflowExecuteRequestSchema = z.object({
  // Capped well above any realistic pipeline — a safety bound, not a design constraint.
  steps: z.array(WorkflowStepInputSchema).min(1).max(10),
});
export type WorkflowExecuteRequest = z.infer<typeof WorkflowExecuteRequestSchema>;

export const WorkflowStepStatusSchema = z.enum(['completed', 'failed', 'skipped']);
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatusSchema>;

export const WorkflowStepOutcomeSchema = z.object({
  resource: z.string(),
  status: WorkflowStepStatusSchema,
  /** This step's share of the upfront escrow — charged only if `status` is "completed"; refunded (a ledger adjustment, not a real transfer — see workflow-executor.ts) otherwise. */
  priceUsd: z.number().nonnegative(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});
export type WorkflowStepOutcome = z.infer<typeof WorkflowStepOutcomeSchema>;

export const WorkflowExecuteResponseSchema = z.object({
  steps: z.array(WorkflowStepOutcomeSchema),
  totalChargedUsd: z.number().nonnegative(),
  refundedUsd: z.number().nonnegative(),
  /** Index of the step that first failed, or null if every step completed. */
  failedStepIndex: z.number().int().nullable(),
});
export type WorkflowExecuteResponse = z.infer<typeof WorkflowExecuteResponseSchema>;
