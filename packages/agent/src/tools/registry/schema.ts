import type Anthropic from "@anthropic-ai/sdk";
import type { ToolCategory } from "../../types.js";
import type { AgentToolDefinition, ToolGroup, ToolParser, ToolPolicyMetadata } from "./types.js";

type FieldDefinition =
  | {
      kind: "string";
      description: string;
      required?: boolean;
      enum?: readonly string[];
    }
  | {
      kind: "number";
      description: string;
      required?: boolean;
    }
  | {
      kind: "boolean";
      description: string;
      required?: boolean;
    }
  | {
      kind: "array";
      description: string;
      required?: boolean;
      minItems?: number;
      items: FieldMap;
    };

type FieldMap = Record<string, FieldDefinition>;

interface DefineToolOptions<TInput, TName extends string> {
  name: TName;
  description: string;
  fields: FieldMap;
  category: ToolCategory;
  group: ToolGroup;
  label: string;
  planStepLabel: string;
  policy?: Partial<Omit<ToolPolicyMetadata, "categoryPermission">> & {
    categoryPermission?: boolean;
  };
  execute: AgentToolDefinition<TInput, TName>["execute"];
}

export class ToolInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputValidationError";
  }
}

export function stringArg(
  description: string,
  options: { required?: boolean; enum?: readonly string[] } = {},
): FieldDefinition {
  return { kind: "string", description, ...options };
}

export function numberArg(description: string, options: { required?: boolean } = {}): FieldDefinition {
  return { kind: "number", description, ...options };
}

export function booleanArg(description: string, options: { required?: boolean } = {}): FieldDefinition {
  return { kind: "boolean", description, ...options };
}

export function arrayArg(
  description: string,
  items: FieldMap,
  options: { required?: boolean; minItems?: number } = {},
): FieldDefinition {
  return { kind: "array", description, items, ...options };
}

function objectSchema(fields: FieldMap): Anthropic.Tool.InputSchema {
  const required = Object.entries(fields).flatMap(([name, field]) => (
    field.required ? [name] : []
  ));

  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [name, fieldSchema(field)])
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

function objectParser<TInput>(fields: FieldMap): ToolParser<TInput> {
  return (input) => parseObject(fields, input, "input") as TInput;
}

export function defineTool<const TName extends string, TInput>(
  definition: DefineToolOptions<TInput, TName>,
): AgentToolDefinition<TInput, TName> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: objectSchema(definition.fields),
    parse: objectParser<TInput>(definition.fields),
    category: definition.category,
    group: definition.group,
    labels: {
      executed: definition.label,
      planStep: definition.planStepLabel,
    },
    policy: {
      categoryPermission: true,
      ...definition.policy,
    },
    execute: definition.execute,
  };
}
