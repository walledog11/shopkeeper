export type FieldDefinition =
  | {
      kind: "string";
      description: string;
      required?: boolean;
      enum?: readonly string[];
      nonBlank?: boolean;
      /** As on an array field: written by the runtime, never shown to the model. */
      runtimeOnly?: boolean;
      /**
       * Required in the schema the model is shown but optional when parsing, for
       * a field added after inputs without it were persisted.
       */
      modelRequired?: boolean;
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
      /** Hidden from the model; still parsed on inputs persisted before retirement. */
      retired?: boolean;
    }
  | {
      kind: "array";
      description: string;
      required?: boolean;
      minItems?: number;
      items: FieldMap;
      /**
       * Written by the runtime, never by the model: parsed like any field but
       * left out of the schema the model is shown.
       */
      runtimeOnly?: boolean;
    };

export type FieldMap = Record<string, FieldDefinition>;

type FieldValue<Field extends FieldDefinition> =
  Field extends { kind: "string"; enum: readonly (infer Value extends string)[] } ? Value
    : Field extends { kind: "string" } ? string
      : Field extends { kind: "number" } ? number
        : Field extends { kind: "boolean" } ? boolean
          : Field extends { kind: "array"; items: infer Items extends FieldMap } ? InputFromFields<Items>[]
            : never;

/** Runtime requiredness is independent of modelRequired and runtimeOnly. */
export type InputFromFields<Fields extends FieldMap> = keyof Fields extends never ? Record<string, never> : {
  -readonly [Key in keyof Fields as Fields[Key] extends { required: true } ? Key : never]: FieldValue<Fields[Key]>;
} & {
  -readonly [Key in keyof Fields as Fields[Key] extends { required: true } ? never : Key]?: FieldValue<Fields[Key]>;
};

type StringOptions = Omit<Extract<FieldDefinition, { kind: "string" }>, "kind" | "description">;
type ArrayOptions = Omit<Extract<FieldDefinition, { kind: "array" }>, "kind" | "description" | "items">;

export function stringArg<const Options extends StringOptions = Record<never, never>>(
  description: string,
  options: Options = {} as Options,
) {
  return { kind: "string" as const, description, ...options };
}

export function numberArg<const Options extends { required?: boolean } = Record<never, never>>(
  description: string,
  options: Options = {} as Options,
) {
  return { kind: "number" as const, description, ...options };
}

export function booleanArg<const Options extends { required?: boolean; retired?: boolean } = Record<never, never>>(
  description: string,
  options: Options = {} as Options,
) {
  return { kind: "boolean" as const, description, ...options };
}

export function arrayArg<const Items extends FieldMap, const Options extends ArrayOptions = Record<never, never>>(
  description: string,
  items: Items,
  options: Options = {} as Options,
) {
  return { kind: "array" as const, description, items, ...options };
}
