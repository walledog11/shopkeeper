export type TestNetworkDecision = {
  allowed: boolean;
  reason: string;
  provider?: string | null;
  host?: string;
  hostname?: string;
  raw?: string;
  protocol?: string;
  url?: URL;
};

export function allowTestNetworkHosts(hosts: string | string[]): () => void;
export function resetTestNetworkAllowlist(): void;
export function createTestNetworkGuard(
  fetchImpl: typeof fetch,
  options?: { env?: NodeJS.ProcessEnv; allowedHosts?: Set<string> },
): typeof fetch;
export function installTestNetworkGuard(options?: {
  env?: NodeJS.ProcessEnv;
  allowedHosts?: Set<string>;
  fetchImpl?: typeof fetch;
}): typeof fetch;
export function classifyTestNetworkRequest(
  input: Parameters<typeof fetch>[0],
  options?: { env?: NodeJS.ProcessEnv; allowedHosts?: Set<string> },
): TestNetworkDecision;
