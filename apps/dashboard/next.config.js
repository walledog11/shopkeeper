const path = require('path');

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  serverExternalPackages: ['stripe'],
  transpilePackages: ['@clerk/db'],
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

module.exports = nextConfig;
