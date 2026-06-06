import { BadRequestError, type ApiErrorDetail } from '@/lib/api/errors';

interface BodyErrorOptions {
  message?: string;
  details?: ApiErrorDetail[];
}

interface ReadJsonBodyOptions {
  allowEmpty?: boolean;
  malformed?: BodyErrorOptions;
  empty?: BodyErrorOptions;
}

const MALFORMED_JSON_DETAILS: ApiErrorDetail[] = [
  { code: 'invalid_body', message: 'Request body must be valid JSON' },
];

const EMPTY_JSON_DETAILS: ApiErrorDetail[] = [
  { code: 'invalid_body', message: 'Request body is required' },
];

const OBJECT_JSON_DETAILS: ApiErrorDetail[] = [
  { code: 'invalid_body', message: 'Request body must be a JSON object' },
];

function badRequest(options: BodyErrorOptions | undefined, fallbackMessage: string, fallbackDetails?: ApiErrorDetail[]): BadRequestError {
  return new BadRequestError(options?.message ?? fallbackMessage, options?.details ?? fallbackDetails);
}

export async function readJsonBody(request: Request, options: ReadJsonBodyOptions = {}): Promise<unknown> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw badRequest(options.malformed, 'Invalid JSON body', MALFORMED_JSON_DETAILS);
  }

  if (!text.trim()) {
    if (options.allowEmpty) return undefined;
    throw badRequest(options.empty, 'Request body is required', EMPTY_JSON_DETAILS);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest(options.malformed, 'Invalid JSON body', MALFORMED_JSON_DETAILS);
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function requireJsonObject(value: unknown, options?: BodyErrorOptions): Record<string, unknown> {
  if (!isJsonObject(value)) {
    throw badRequest(options, 'Validation failed', OBJECT_JSON_DETAILS);
  }
  return value;
}

export async function readRequiredJsonObject(request: Request, options: ReadJsonBodyOptions & { object?: BodyErrorOptions } = {}) {
  return requireJsonObject(await readJsonBody(request, options), options.object);
}

export async function readOptionalJsonObject(request: Request, options: ReadJsonBodyOptions & { object?: BodyErrorOptions } = {}) {
  const body = await readJsonBody(request, { ...options, allowEmpty: true });
  if (body === undefined) return undefined;
  return requireJsonObject(body, options.object);
}

export async function readEmptyJsonBody(request: Request, options: ReadJsonBodyOptions & { object?: BodyErrorOptions } = {}) {
  const body = await readJsonBody(request, { ...options, allowEmpty: true });
  if (body === undefined) return;
  const objectBody = requireJsonObject(body, options.object);
  if (Object.keys(objectBody).length > 0) {
    throw badRequest(options.object, 'Request body must be empty', [
      { code: 'invalid_body', message: 'Request body must be empty' },
    ]);
  }
}
