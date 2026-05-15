// Fallback values for CI where no .env file exists.
// Values must match the ?? fallbacks in test files so HMAC signatures align.
const TEST_DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/clerk_test?schema=public',
  META_APP_SECRET: 'test-meta-secret',
  META_VERIFY_TOKEN: 'test-verify-token',
  INTERNAL_API_SECRET: 'test-internal-secret',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  DASHBOARD_URL: 'http://localhost:3000',
  DASHBOARD_INTERNAL_URL: 'http://localhost:3000',
  TWILIO_AUTH_TOKEN: 'test-twilio-token',
  TWILIO_ACCOUNT_SID: 'ACtest',
  SHOPIFY_APP_SECRET: 'test-shopify-secret',
  TELEGRAM_BOT_TOKEN: 'test-telegram-token',
  TELEGRAM_WEBHOOK_SECRET: 'test-telegram-webhook-secret',
};

for (const [key, value] of Object.entries(TEST_DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}
