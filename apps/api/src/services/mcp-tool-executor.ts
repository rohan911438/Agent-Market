import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ErrorResponse, PaymentRequiredResponse } from '@rohankumar4179/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { OutgoingHttpHeaders } from 'node:http';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { buildCatalogTools, type CatalogTool } from './mcp-catalog.js';

export type McpToolResult = CallToolResult;

/**
 * The reserved `_agentmarket` control block every catalog tool's input
 * schema advertises — see mcp-catalog.ts's AGENTMARKET_CONTROL_SCHEMA for
 * the machine-readable description of each field. Parsed leniently
 * (`.default({})`, every field optional): a caller that omits it entirely
 * just gets stateless, no-budget, first-call-needs-a-402 behavior.
 */
const AgentMarketControlSchema = z
  .object({
    payment: z.string().optional(),
    sessionId: z.string().optional(),
    maxCostUsd: z.number().nonnegative().optional(),
    maxSessionSpendUsd: z.number().nonnegative().optional(),
    maxDailySpendUsd: z.number().nonnegative().optional(),
  })
  .default({});

/** Maps this platform's internal AppError codes (see shared-types/errors.ts) onto the MCP-facing vocabulary the spec calls for — one small translation table, not a second error taxonomy. */
const MCP_ERROR_CODE_MAP: Record<string, string> = {
  VALIDATION_ERROR: 'INVALID_ARGUMENT',
  PAYMENT_INVALID: 'PAYMENT_FAILED',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_FAILED',
  PAYMENT_ALREADY_SETTLED: 'PAYMENT_ALREADY_USED',
  NOT_FOUND: 'CAPABILITY_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

function mapErrorCode(internalCode: string): string {
  return MCP_ERROR_CODE_MAP[internalCode] ?? internalCode;
}

function errorResult(code: string, message: string, details?: unknown): McpToolResult {
  const structured = { code, message, ...(details !== undefined ? { details } : {}) };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

function paymentRequiredResult(toolName: string, body: PaymentRequiredResponse): McpToolResult {
  const requirement = body.accepts[0];
  const summary = requirement
    ? `"${toolName}" costs ${requirement.amount ?? requirement.maxAmountRequired} atomic units of ${requirement.asset} on ${requirement.network}, payable to ${requirement.payTo}. ` +
      'Sign a payment against this requirement, base64-encode the X-PAYMENT payload, and resend this same tool call with it in `_agentmarket.payment`.'
    : `"${toolName}" requires payment.`;
  const structured = { code: 'PAYMENT_REQUIRED', message: summary, paymentRequired: body };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : { result: body };
}

/**
 * Executes one catalog tool (first- or third-party) exactly as a direct HTTP
 * caller would — by injecting a real request into the same real, unmodified
 * x402-metered route (`server.inject`, in-process, no network hop; the same
 * mechanism workflow-executor.ts already uses for its own 402 price probes).
 * Nothing about payment verification, settlement, replay protection, rate
 * limiting, caching, or audit logging is reimplemented here: every one of
 * those runs exactly as it does for a plain REST call, because this *is* a
 * plain REST call, just issued from inside the process instead of over the
 * network. See register-metered-route.ts / middleware/x402-payment.ts.
 */
export async function executeCatalogTool(
  ctx: AppContext,
  server: FastifyInstance,
  toolName: string,
  rawArguments: Record<string, unknown> | undefined,
  callerRequest: FastifyRequest,
): Promise<McpToolResult> {
  const tools = await buildCatalogTools(ctx);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return errorResult('CAPABILITY_NOT_FOUND', `Unknown tool "${toolName}".`);
  }

  const parsedControl = AgentMarketControlSchema.safeParse((rawArguments ?? {})._agentmarket);
  if (!parsedControl.success) {
    return errorResult('INVALID_ARGUMENT', 'Invalid `_agentmarket` control block.', parsedControl.error.flatten());
  }
  const control = parsedControl.data;

  const forwardedArgs = { ...(rawArguments ?? {}) };
  delete forwardedArgs._agentmarket;

  const priceUsd = tool.agentmarket.priceUsd;
  if (priceUsd !== null && priceUsd > 0) {
    const budgetConfig = {
      perCallUsd: control.maxCostUsd,
      sessionUsd: control.maxSessionSpendUsd,
      dailyUsd: control.maxDailySpendUsd,
    };
    const budgetCheck = await ctx.mcpSessionBudgets.check(control.sessionId, budgetConfig, priceUsd);
    if (!budgetCheck.ok) {
      return errorResult(
        'BUDGET_EXCEEDED',
        `Calling "${toolName}" ($${priceUsd.toFixed(4)}) would exceed the declared ${budgetCheck.limit} cap of $${budgetCheck.limitUsd?.toFixed(4)}.`,
        { limit: budgetCheck.limit, limitUsd: budgetCheck.limitUsd, wouldSpendUsd: budgetCheck.wouldSpendUsd },
      );
    }
  }

  const injected = await injectToolCall(ctx, server, tool, forwardedArgs, control.payment, callerRequest);

  if (injected.statusCode === 402) {
    return paymentRequiredResult(toolName, injected.body as PaymentRequiredResponse);
  }
  if (injected.statusCode >= 400) {
    const body = injected.body as Partial<ErrorResponse>;
    const code = body.error?.code ?? 'INTERNAL_ERROR';
    return errorResult(mapErrorCode(code), body.error?.message ?? `Tool "${toolName}" failed.`, body.error?.details);
  }

  if (priceUsd !== null && priceUsd > 0) {
    await ctx.mcpSessionBudgets.record(control.sessionId, priceUsd);
  }

  const structured = asRecord(injected.body);
  const walletToken = injected.headers['x-wallet-token'];
  if (typeof walletToken === 'string') structured.walletToken = walletToken;

  return { isError: false, content: [{ type: 'text', text: JSON.stringify(injected.body) }], structuredContent: structured };
}

interface InjectedResponse {
  statusCode: number;
  body: unknown;
  headers: OutgoingHttpHeaders;
}

async function injectToolCall(
  ctx: AppContext,
  server: FastifyInstance,
  tool: CatalogTool,
  args: Record<string, unknown>,
  payment: string | undefined,
  callerRequest: FastifyRequest,
): Promise<InjectedResponse> {
  const headers: Record<string, string> = {};
  if (payment) headers['x-payment'] = payment;
  const walletToken = callerRequest.headers['x-wallet-token'];
  if (typeof walletToken === 'string') headers['x-wallet-token'] = walletToken;
  // Preserves the real caller's rate-limit bucket (see middleware/rate-limit.ts) —
  // without this every injected sub-request would land in the shared
  // loopback bucket instead of the MCP caller's own IP.
  const remoteAddress = callerRequest.ip;

  if (tool.agentmarket.isThirdParty) {
    const res = await server.inject({
      method: 'POST',
      url: `/v1/listings/${tool.agentmarket.slug}/invoke`,
      headers: { ...headers, 'content-type': 'application/json' },
      remoteAddress,
      payload: { operationId: tool.agentmarket.operationId, params: args },
    });
    return { statusCode: res.statusCode, body: safeJson(res.body), headers: res.headers };
  }

  if (tool.agentmarket.method === 'GET' || tool.agentmarket.method === 'DELETE') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const qs = query.toString();
    const res = await server.inject({
      method: tool.agentmarket.method,
      url: qs ? `${tool.agentmarket.resource}?${qs}` : tool.agentmarket.resource,
      headers,
      remoteAddress,
    });
    return { statusCode: res.statusCode, body: safeJson(res.body), headers: res.headers };
  }

  const res = await server.inject({
    method: tool.agentmarket.method,
    url: tool.agentmarket.resource,
    headers: { ...headers, 'content-type': 'application/json' },
    remoteAddress,
    payload: args,
  });
  return { statusCode: res.statusCode, body: safeJson(res.body), headers: res.headers };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
