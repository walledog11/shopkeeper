import { BadRequestError, type ApiErrorDetail } from "@/lib/api/errors";
import { requireTrimmedInstruction } from "@/lib/agent/api/auth";
import { decodeActionLogCursor } from "@/lib/agent/api/turns";
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

export function parseApprovedToolCalls(value: unknown): RawToolCall[] | undefined {
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
  };
}

export function parseActionLogCursorQuery(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeActionLogCursor(rawCursor) : null;

  if (rawCursor && !cursor) {
    throw new BadRequestError("Validation failed", [
      { code: "invalid", field: "cursor", message: "Cursor is invalid" },
    ]);
  }

  return { cursor };
}
