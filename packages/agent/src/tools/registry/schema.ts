import type Anthropic from "@anthropic-ai/sdk";
import type { ToolCategory } from "../../types.js";
import type { ShopifyOAuthScope } from "../../shopify/integration-health.js";
import type {
  AgentToolDefinition,
  MerchantFollowUp,
  ToolCapability,
  ToolGroup,
  ToolParser,
  ToolPolicyMetadata,
} from "./types.js";

import type { FieldDefinition, FieldMap, InputFromFields } from "./fields.js";
export { stringArg, numberArg, booleanArg, arrayArg } from "./fields.js";

interface DefineToolOptions<TFields extends FieldMap, TName extends string> {
  name: TName;
  description: string;
  fields: TFields;
  category: ToolCategory;
  group: ToolGroup;
  capabilities: readonly ToolCapability[];
  label: string;
  planStepLabel: string;
  availability?: "active" | "retired";
  /** Shopify OAuth scopes without which this tool cannot run. */
  requiredScopes?: readonly ShopifyOAuthScope[];
  /** Versioned outcome receipt required on identity-bearing executions. */
  requiredReceiptVersion?: 1;
  merchantFollowUp?: MerchantFollowUp;
  completesMerchantFollowUp?: MerchantFollowUp;
  policy?: Partial<Omit<ToolPolicyMetadata, "categoryPermission">> & {
    categoryPermission?: boolean;
  };
  execute: AgentToolDefinition<InputFromFields<NoInfer<TFields>>, TName>["execute"];
}

export class ToolInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputValidationError";
  }
}

function objectSchema(fields: FieldMap): Anthropic.Tool.InputSchema {
  const modelFields = Object.entries(fields).filter(([, field]) => (
    !((field.kind === "array" || field.kind === "string") && field.runtimeOnly)
    && !(field.kind === "boolean" && field.retired)
  ));
  const required = modelFields.flatMap(([name, field]) => (
    field.required || (field.kind === "string" && field.modelRequired) ? [name] : []
  ));

  return {
    type: "object",
    properties: Object.fromEntries(
      modelFields.map(([name, field]) => [name, fieldSchema(field)])
    ),
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function fieldSchema(field: FieldDefinition): Record<string, unknown> {
  if (field.kind === "array") {
    return {
      type: "array",
      description: field.description,
      items: objectSchema(field.items),
      ...(field.minItems !== undefined ? { minItems: field.minItems } : {}),
    };
  }

  return {
    type: field.kind,
    description: field.description,
    ...(field.kind === "string" && field.enum ? { enum: field.enum } : {}),
    ...(field.kind === "string" && field.nonBlank ? { minLength: 1 } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationMessage(path: string, message: string): ToolInputValidationError {
  return new ToolInputValidationError(`${path} ${message}`);
}

function parseObject(fields: FieldMap, input: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw validationMessage(path, "must be an object.");
  }

  const allowedKeys = new Set(Object.keys(fields));
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw validationMessage(`${path}.${key}`, "is not allowed.");
    }
  }

  const parsed: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key];
    const fieldPath = `${path}.${key}`;
    if (value === undefined) {
      if (field.required) {
        throw validationMessage(fieldPath, "is required.");
      }
      continue;
    }
    parsed[key] = parseField(field, value, fieldPath);
  }

  return parsed;
}

function parseField(field: FieldDefinition, value: unknown, path: string): unknown {
  if (field.kind === "array") {
    if (!Array.isArray(value)) {
      throw validationMessage(path, "must be an array.");
    }
    if (field.minItems !== undefined && value.length < field.minItems) {
      throw validationMessage(path, `must include at least ${field.minItems} item.`);
    }
    return value.map((item, index) => parseObject(field.items, item, `${path}[${index}]`));
  }

  if (field.kind === "string") {
    if (typeof value !== "string") {
      throw validationMessage(path, "must be a string.");
    }
    if (field.enum && !field.enum.includes(value)) {
      throw validationMessage(path, `must be one of: ${field.enum.join(", ")}.`);
    }
    if (field.nonBlank && value.trim().length === 0) {
      throw validationMessage(path, "must not be blank.");
    }
    return value;
  }

  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw validationMessage(path, "must be a finite number.");
    }
    return value;
  }

  if (typeof value !== "boolean") {
    throw validationMessage(path, "must be a boolean.");
  }
  return value;
}

function objectParser<TFields extends FieldMap>(fields: TFields): ToolParser<InputFromFields<TFields>> {
  return (input) => parseObject(fields, input, "input") as InputFromFields<TFields>;
}

export function defineTool<const TName extends string, const TFields extends FieldMap>(
  definition: DefineToolOptions<TFields, TName>,
): AgentToolDefinition<InputFromFields<TFields>, TName> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: objectSchema(definition.fields),
    parse: objectParser(definition.fields),
    category: definition.category,
    group: definition.group,
    capabilities: definition.capabilities,
    labels: {
      executed: definition.label,
      planStep: definition.planStepLabel,
    },
    policy: {
      categoryPermission: true,
      ...definition.policy,
    },
    availability: definition.availability ?? "active",
    requiredScopes: definition.requiredScopes ?? [],
    requiredReceiptVersion: definition.requiredReceiptVersion ?? null,
    merchantFollowUp: definition.merchantFollowUp ?? null,
    completesMerchantFollowUp: definition.completesMerchantFollowUp ?? null,
    execute: definition.execute,
  };
}
