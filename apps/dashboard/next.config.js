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
  'media-src': ["'self'", 'https://*.public.blob.vercel-storage.com'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://*.sentry.io',
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
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

const repoRoot = path.resolve(__dirname, '../..');

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
  async redirects() {
    return [
      {
        source: '/dashboard/reports',
        destination: '/dashboard/analytics?tab=export',
        permanent: false,
      },
      {
        source: '/dashboard/activity',
        destination: '/dashboard/review?tab=audit',
        permanent: false,
      },
    ];
  },
  turbopack: {
    root: repoRoot,
  },
  serverExternalPackages: ['stripe'],
  transpilePackages: ['@shopkeeper/db'],
  images: {
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
  org: 'shopkeeper-me',
  project: 'shopkeeper',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: process.env.SENTRY_SKIP_UPLOAD === 'true',
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
