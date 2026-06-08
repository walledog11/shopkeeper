export function resolveSentryRelease(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = (
    env.SENTRY_RELEASE ||
    env.RAILWAY_GIT_COMMIT_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    ''
  ).trim();

  if (!raw) {
    return undefined;
  }

  return raw.includes('@') ? raw : `shopkeeper@${raw}`;
}
