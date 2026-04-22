import logger from './logger.js';
const REQUIRED_ENV = [
    'DATABASE_URL',
    'REDIS_URL',
    'ANTHROPIC_API_KEY',
    'INTERNAL_API_SECRET',
    'META_APP_SECRET',
];
function hasEnv(name) {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
}
function requireEnv(name) {
    const value = process.env[name];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`[Gateway] Missing required environment variable: ${name}`);
    }
    return value.trim();
}
function normalizeAbsoluteUrl(name, value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error(`[Gateway] ${name} must be a valid absolute URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`[Gateway] ${name} must use http or https`);
    }
    return value.replace(/\/+$/, '');
}
export function getGatewayDashboardUrl() {
    const url = process.env.DASHBOARD_URL?.trim() || process.env.DASHBOARD_INTERNAL_URL?.trim();
    if (!url) {
        throw new Error('[Gateway] Missing required environment variable: DASHBOARD_URL');
    }
    return normalizeAbsoluteUrl(process.env.DASHBOARD_URL?.trim() ? 'DASHBOARD_URL' : 'DASHBOARD_INTERNAL_URL', url);
}
export function validateGatewayEnv() {
    const missing = REQUIRED_ENV.filter((name) => !hasEnv(name));
    if (missing.length > 0) {
        throw new Error(`[Gateway] Missing required environment variables: ${missing.join(', ')}`);
    }
    getGatewayDashboardUrl();
    if (process.env.NODE_ENV === 'production' && !hasEnv('DASHBOARD_URL')) {
        throw new Error('[Gateway] Missing required environment variable: DASHBOARD_URL');
    }
    const dbUrl = requireEnv('DATABASE_URL');
    if (!dbUrl.includes('pgbouncer=true')) {
        logger.warn('[Gateway] DATABASE_URL is missing pgbouncer=true — add it to avoid connection exhaustion in production');
    }
    if (!dbUrl.includes('connection_limit=')) {
        logger.warn('[Gateway] DATABASE_URL is missing connection_limit — add it (e.g. connection_limit=1) to avoid connection exhaustion in production');
    }
    if (process.env.NODE_ENV === 'production' && hasEnv('DASHBOARD_INTERNAL_URL')) {
        logger.warn('[Gateway] DASHBOARD_INTERNAL_URL is set in production. Prefer DASHBOARD_URL and reserve DASHBOARD_INTERNAL_URL for local callback forwarding.');
    }
}
