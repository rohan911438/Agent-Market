import { z } from 'zod';

/**
 * A2A (Agent-to-Agent) protocol types, hand-authored against the public
 * JSON-RPC-shaped A2A spec rather than `@a2a-js/sdk` — that package's
 * server-side internals are protobuf-first (numeric `TaskState` enums,
 * `$case`-discriminated `Part` unions, generated `MessageFns` encoders),
 * which fights a plain Fastify + Zod + JSON stack for no benefit here:
 * none of AgentMarket's first-party endpoints need gRPC, streaming, push
 * notifications, or multi-tenant scoping. See Phase 5's decision notes.
 */

export const A2APartSchema = z.object({
  kind: z.enum(['text', 'data', 'file']),
  text: z.string().optional(),
  data: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type A2APart = z.infer<typeof A2APartSchema>;

export const A2AMessageSchema = z.object({
  kind: z.literal('message').optional(),
  messageId: z.string(),
  role: z.enum(['user', 'agent']),
  parts: z.array(A2APartSchema).min(1),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type A2AMessage = z.infer<typeof A2AMessageSchema>;

export const A2ATaskStateSchema = z.enum([
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
  'rejected',
  'auth-required',
]);
export type A2ATaskState = z.infer<typeof A2ATaskStateSchema>;

export const A2AArtifactSchema = z.object({
  artifactId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  parts: z.array(A2APartSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type A2AArtifact = z.infer<typeof A2AArtifactSchema>;

export const A2ATaskSchema = z.object({
  id: z.string(),
  contextId: z.string(),
  kind: z.literal('task').optional(),
  status: z.object({
    state: A2ATaskStateSchema,
    timestamp: z.string().optional(),
    message: A2AMessageSchema.optional(),
  }),
  artifacts: z.array(A2AArtifactSchema).optional(),
  history: z.array(A2AMessageSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type A2ATask = z.infer<typeof A2ATaskSchema>;

export const A2ASkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  inputModes: z.array(z.string()),
  outputModes: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type A2ASkill = z.infer<typeof A2ASkillSchema>;

export const A2AAgentCardSchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string(),
  version: z.string(),
  capabilities: z.object({
    streaming: z.boolean(),
    pushNotifications: z.boolean(),
    stateTransitionHistory: z.boolean(),
  }),
  defaultInputModes: z.array(z.string()),
  defaultOutputModes: z.array(z.string()),
  skills: z.array(A2ASkillSchema),
});
export type A2AAgentCard = z.infer<typeof A2AAgentCardSchema>;

export const A2ASendMessageParamsSchema = z.object({
  message: A2AMessageSchema,
  configuration: z.record(z.string(), z.unknown()).optional(),
});
export type A2ASendMessageParams = z.infer<typeof A2ASendMessageParamsSchema>;

export const A2ATaskIdParamsSchema = z.object({ id: z.string() });
export type A2ATaskIdParams = z.infer<typeof A2ATaskIdParamsSchema>;

export const A2AJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.string(),
  params: z.unknown().optional(),
});
export type A2AJsonRpcRequest = z.infer<typeof A2AJsonRpcRequestSchema>;

export const A2AJsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type A2AJsonRpcErrorShape = z.infer<typeof A2AJsonRpcErrorSchema>;

export const A2AJsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: A2AJsonRpcErrorSchema.optional(),
});
export type A2AJsonRpcResponse = z.infer<typeof A2AJsonRpcResponseSchema>;

/** Reserved JSON-RPC codes plus the A2A-specific range (-32001..-32006) from the public spec. */
export const A2A_ERROR_CODES = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  TaskNotFound: -32001,
  TaskNotCancelable: -32002,
  PushNotificationNotSupported: -32003,
  UnsupportedOperation: -32004,
} as const;
