/** @param {NodeJS.ProcessEnv} [env] */
export function resolveSentryRelease(env = process.env) {
  const raw = (
    env.SENTRY_RELEASE ||
    env.RAILWAY_GIT_COMMIT_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    ''
  ).trim();

  if (!raw) {
    return '';
  }

  return raw.includes('@') ? raw : `shopkeeper@${raw}`;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function hasSentryUploadCredentials(env = process.env) {
  return Boolean(
    env.SENTRY_AUTH_TOKEN?.trim() &&
      env.SENTRY_ORG?.trim() &&
      env.SENTRY_PROJECT?.trim(),
  );
}

/** @param {NodeJS.ProcessEnv} [env] */
export function isDeployBuild(env = process.env) {
  return (
    env.VERCEL === '1' ||
    typeof env.RAILWAY_ENVIRONMENT === 'string' ||
    env.CI === 'true' ||
    env.CI === '1'
  );
}

/** @param {NodeJS.ProcessEnv} [env] */
export function missingSentryUploadVars(env = process.env) {
  return ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].filter(
    (name) => !env[name]?.trim(),
  );
}
