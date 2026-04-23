export function readEnv(name: string, env = process.env): string | null {
  const value = env[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasEnv(name: string, env = process.env): boolean {
  return readEnv(name, env) !== null;
}

export function requireEnv(name: string, env = process.env): string {
  const value = readEnv(name, env);
  if (!value) {
    throw new Error(`[Dashboard] Missing required environment variable: ${name}`);
  }
  return value;
}

export function normalizeAbsoluteUrl(name: string, value = requireEnv(name)): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[Dashboard] ${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`[Dashboard] ${name} must use http or https`);
  }

  return value.replace(/\/+$/, "");
}
