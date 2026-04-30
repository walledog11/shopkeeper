const path = require('path');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
