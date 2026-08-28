import { ApiRequestError, requestJson } from "@/lib/api/fetcher";

import { isRecord } from "@shopkeeper/agent/guards";
export interface ChannelBindingAttempt {
  value: string;
  expiresAt: number;
}

interface StartBindingOptions {
  signal?: AbortSignal;
  now?: () => number;
}

class ChannelBindingContractError extends Error {
  constructor(message: string, public readonly payload: unknown) {
    super(message);
    this.name = "ChannelBindingContractError";
  }
}


function parseAttempt(
  payload: unknown,
  valueField: "token" | "url",
  fallbackError: string,
  now: () => number,
): ChannelBindingAttempt {
  if (!isRecord(payload)) {
    throw new ChannelBindingContractError(fallbackError, payload);
  }

  const rawValue = payload[valueField];
  const expiresInSeconds = payload.expiresInSeconds;
  if (
    typeof rawValue !== "string"
    || !rawValue.trim()
    || !Number.isSafeInteger(expiresInSeconds)
    || (expiresInSeconds as number) <= 0
  ) {
    throw new ChannelBindingContractError(fallbackError, payload);
  }

  const value = rawValue.trim();
  if (valueField === "url") {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:"
        || url.hostname !== "t.me"
        || url.username
        || url.password
      ) {
        throw new Error("Unexpected Telegram URL");
      }
    } catch {
      throw new ChannelBindingContractError(fallbackError, payload);
    }
  }

  return {
    value,
    expiresAt: now() + (expiresInSeconds as number) * 1_000,
  };
}

async function startBinding(
  path: string,
  valueField: "token" | "url",
  fallbackError: string,
  options: StartBindingOptions,
): Promise<ChannelBindingAttempt> {
  try {
    const payload = await requestJson<unknown>(
      path,
      { method: "POST", signal: options.signal },
      fallbackError,
    );
    return parseAttempt(payload, valueField, fallbackError, options.now ?? Date.now);
  } catch (error) {
    if (error instanceof ApiRequestError || error instanceof ChannelBindingContractError) {
      throw error;
    }
    throw new Error(fallbackError, { cause: error });
  }
}

export async function startImessageBinding(
  options: StartBindingOptions = {},
): Promise<ChannelBindingAttempt> {
  return startBinding(
    "/api/integrations/imessage/bind",
    "token",
    "Couldn't create a connect code.",
    options,
  );
}

export async function startTelegramBinding(
  options: StartBindingOptions = {},
): Promise<ChannelBindingAttempt> {
  return startBinding(
    "/api/integrations/telegram",
    "url",
    "Couldn't start Telegram connect.",
    options,
  );
}
