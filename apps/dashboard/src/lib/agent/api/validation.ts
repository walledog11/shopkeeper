import { BadRequestError, type ApiErrorDetail } from "@/lib/api/errors";
import { requireTrimmedInstruction } from "@/lib/agent/api/auth";
import { decodeAgentActionCursor, type AgentActionCursor } from "@/lib/agent/api/action-log";
import type { RawToolCall } from "@/types";

function invalidField(field: string, message: string, code = "invalid"): never {
  throw new BadRequestError("Validation failed", [{ code, field, message }]);
}

function invalidBody(message = "Request body must be a JSON object"): never {
  throw new BadRequestError("Validation failed", [{ code: "invalid_body", message }]);
}

function requireObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalidBody();
  }

  return body as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    invalidField(fieldName, `${fieldName} must be a string`);
  }

  const stringValue = value as string;
  if (stringValue.length === 0) {
    invalidField(fieldName, `${fieldName} is required`, "required");
  }

  return stringValue;
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    invalidField(fieldName, `${fieldName} must be a string`);
  }

  return value as string;
}

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    invalidField(fieldName, `${fieldName} must be a boolean`);
  }

  return value as boolean;
}

function parseApprovedToolCalls(value: unknown): RawToolCall[] | undefined {
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    invalidField("approvedToolCalls", "approvedToolCalls must be an array");
  }

  return (value as unknown[]).map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") {
      invalidField(`approvedToolCalls[${index}]`, "Each approved tool call must be an object");
    }

    const candidate = item as Partial<RawToolCall>;
    const details: ApiErrorDetail[] = [];
    if (typeof candidate.id !== "string") {
      details.push({ code: "required", field: `approvedToolCalls[${index}].id`, message: "Tool call id is required" });
    }
    if (typeof candidate.name !== "string") {
      details.push({ code: "required", field: `approvedToolCalls[${index}].name`, message: "Tool call name is required" });
    }
    if (details.length > 0) {
      throw new BadRequestError("Validation failed", details);
    }

    const id = candidate.id as string;
    const name = candidate.name as string;

    return {
      id,
      name,
      input: candidate.input,
    };
  });
}

export function parseAgentRouteBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    threadId: requireNonEmptyString(candidate.threadId, "threadId"),
    instruction: requireTrimmedInstruction(candidate.instruction),
    approvedToolCalls: parseApprovedToolCalls(candidate.approvedToolCalls),
  };
}

export function parseAgentAskBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    threadId: requireNonEmptyString(candidate.threadId, "threadId"),
    instruction: requireTrimmedInstruction(candidate.instruction),
  };
}

export function parseAgentQuickApproveBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    threadId: requireNonEmptyString(candidate.threadId, "threadId"),
  };
}

export function parseAgentChatBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    instruction: requireTrimmedInstruction(candidate.instruction),
    sessionId: parseOptionalString(candidate.sessionId, "sessionId"),
  };
}

export function parseAgentInternalBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    orgId: requireNonEmptyString(candidate.orgId, "orgId"),
    instruction: requireTrimmedInstruction(candidate.instruction),
    orderNumber: parseOptionalString(candidate.orderNumber, "orderNumber"),
    senderPhone: parseOptionalString(candidate.senderPhone, "senderPhone"),
    clerkUserId: parseOptionalString(candidate.clerkUserId, "clerkUserId"),
    threadId: parseOptionalString(candidate.threadId, "threadId"),
    approvedToolCalls: parseApprovedToolCalls(candidate.approvedToolCalls),
  };
}

export function parseAgentPlanBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    threadId: requireNonEmptyString(candidate.threadId, "threadId"),
    instruction: requireTrimmedInstruction(candidate.instruction),
    force: parseOptionalBoolean(candidate.force, "force") ?? false,
  };
}

export function parseAgentPlanInternalBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    orgId: requireNonEmptyString(candidate.orgId, "orgId"),
    threadId: requireNonEmptyString(candidate.threadId, "threadId"),
    allowAutoExecute: parseOptionalBoolean(candidate.allowAutoExecute, "allowAutoExecute") ?? false,
  };
}

export function parseAgentOrderRiskInternalBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    orgId: requireNonEmptyString(candidate.orgId, "orgId"),
    orderId: requireNonEmptyString(candidate.orderId, "orderId"),
  };
}

export function parseAgentVoiceBody(body: unknown) {
  const candidate = requireObject(body);
  return {
    action: parseOptionalString(candidate.action, "action"),
  };
}

export type ActionLogMode = "human_approved" | "auto_executed" | "read_only";

const VALID_MODES: ActionLogMode[] = ["human_approved", "auto_executed", "read_only"];

export interface ActionLogFilters {
  channels?: string[];
  tools?: string[];
  modes?: ActionLogMode[];
  errorsOnly?: boolean;
  from?: Date;
  to?: Date;
}

function parseCsvList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const list = value.split(",").flatMap((s) => {
    const trimmed = s.trim();
    return trimmed ? [trimmed] : [];
  });
  return list.length === 0 ? undefined : list;
}

function parseDateParam(value: string | null, field: "from" | "to"): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    invalidField(field, `${field} must be a valid ISO date`);
  }
  return date;
}

export function parseActionLogCursorQuery(request: Request): { cursor: AgentActionCursor | null; filters: ActionLogFilters } {
  const { searchParams } = new URL(request.url);
  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeAgentActionCursor(rawCursor) : null;

  if (rawCursor && !cursor) {
    throw new BadRequestError("Validation failed", [
      { code: "invalid", field: "cursor", message: "Cursor is invalid" },
    ]);
  }

  const from = parseDateParam(searchParams.get("from"), "from");
  const to = parseDateParam(searchParams.get("to"), "to");
  if (from && to && from.getTime() > to.getTime()) {
    invalidField("to", "to must be after from");
  }

  const rawModes = parseCsvList(searchParams.get("mode"));
  let modes: ActionLogMode[] | undefined;
  if (rawModes) {
    const invalid = rawModes.find((m) => !VALID_MODES.includes(m as ActionLogMode));
    if (invalid) invalidField("mode", `mode must be one of ${VALID_MODES.join(", ")}`);
    modes = rawModes as ActionLogMode[];
  }

  const filters: ActionLogFilters = {
    channels: parseCsvList(searchParams.get("channel")),
    tools: parseCsvList(searchParams.get("tool")),
    modes,
    errorsOnly: searchParams.get("errorsOnly") === "true" ? true : undefined,
    from,
    to,
  };

  return { cursor, filters };
}
