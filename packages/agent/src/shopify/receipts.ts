import type { ReceiptFailureV1, ReceiptTargetV1, ToolResult } from "../tools/result.js";
import type { ShopifyContext } from "./client.js";

export interface ShopifyReceiptEnvelopeV1 {
  version: 1;
  operationId: string;
  executionId: string;
  target: ReceiptTargetV1;
  observedAt: string;
}

/**
 * Legacy direct adapter callers do not always have durable identities. The
 * execution runtime supplies both; adapters emit no partial receipt if either
 * is absent, because fabricating one would break operation recovery.
 */
export function shopifyReceiptEnvelope(
  ctx: ShopifyContext,
  target: ReceiptTargetV1,
): ShopifyReceiptEnvelopeV1 | null {
  if (!ctx.operationId || !ctx.executionId) return null;
  return {
    version: 1,
    operationId: ctx.operationId,
    executionId: ctx.executionId,
    target,
    observedAt: new Date().toISOString(),
  };
}

export function shopifyFailureReceipt(
  ctx: ShopifyContext,
  target: ReceiptTargetV1,
  tool: ReceiptFailureV1["tool"],
  outcome: ReceiptFailureV1["outcome"],
  code: string,
  providerReference: string | null = null,
): ReceiptFailureV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, target);
  return envelope ? {
    ...envelope,
    tool,
    outcome,
    code,
    providerReference,
  } : undefined;
}

/** Bind an adapter's fixed receipt identity without repeating its failure envelope. */
export function shopifyReceiptResults(tool: ReceiptFailureV1["tool"], targetKind: string) {
  const failureReceipt = (
    ctx: ShopifyContext,
    targetId: string,
    outcome: ReceiptFailureV1["outcome"],
    code: string,
    providerReference: string | null = null,
  ) => shopifyFailureReceipt(ctx, { kind: targetKind, id: targetId }, tool, outcome, code, providerReference);
  return {
    failure<Result extends ToolResult>(
      ctx: ShopifyContext,
      targetId: string,
      result: Result,
      outcome: ReceiptFailureV1["outcome"],
      code: string,
      providerReference: string | null = null,
    ): Result {
      const receipt = failureReceipt(ctx, targetId, outcome, code, providerReference);
      return receipt ? { ...result, receipt } : result;
    },
    unknown(ctx: ShopifyContext, targetId: string, code: string, providerReference: string | null = null) {
      return failureReceipt(ctx, targetId, "unknown", code, providerReference);
    },
  };
}
