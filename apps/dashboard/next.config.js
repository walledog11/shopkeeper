const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://challenges.cloudflare.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://*.clerk.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://*.sentry.io',
    'https://*.ingest.sentry.io',
  ],
  'frame-src': ['https://*.clerk.com', 'https://challenges.cloudflare.com'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'", 'https://*.clerk.com'],
  'frame-ancestors': ["'self'"],
};

const CSP_HEADER_VALUE = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_HEADER_VALUE },
];

const NOINDEX_HEADERS = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
const NOINDEX_PATH_GROUP =
  '(login|signup|select-org|create-org|welcome|plan|connect|dashboard|api)';

function resolveSentryRelease() {
  const raw = (
    process.env.SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    ''
  ).trim();

  if (!raw) {
    return undefined;
  }

  return raw.includes('@') ? raw : `shopkeeper@${raw}`;
}

function missingSentryUploadEnv() {
  return ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].filter(
    (name) => !process.env[name]?.trim(),
  );
}

if (process.env.VERCEL === '1') {
  const missing = missingSentryUploadEnv();
  if (missing.length > 0) {
    throw new Error(
      `[sentry] Vercel build missing source map env: ${missing.join(', ')}. ` +
        'Add them under Project Settings → Environment Variables for Production builds.',
    );
  }
}

console.log('[shopkeeper/dashboard] next.config loaded', {
  vercel: process.env.VERCEL === '1',
  release: resolveSentryRelease() ?? '(none)',
  sentryProject: process.env.SENTRY_PROJECT ?? '(unset)',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Next 16.2's Turbopack persistence can race compaction and delete its live cache.
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      { source: '/(.*)', headers: SECURITY_HEADERS },
      { source: `/:path${NOINDEX_PATH_GROUP}`, headers: NOINDEX_HEADERS },
      { source: `/:path${NOINDEX_PATH_GROUP}/:rest*`, headers: NOINDEX_HEADERS },
    ];
  },
  turbopack: {
    root: path.resolve(__dirname, '../..'),
    debugIds: true,
  },
  serverExternalPackages: ['stripe'],
  transpilePackages: ['@shopkeeper/db'],
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.fbcdn.net',
      },
    ],
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: false,
  widenClientFileUpload: true,
  release: {
    name: resolveSentryRelease(),
  },
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
