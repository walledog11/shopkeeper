import type { EmailIntegrationProvider } from './email-integration';

type ClientIdEnv = 'GOOGLE_CLIENT_ID';
type ClientSecretEnv = 'GOOGLE_CLIENT_SECRET';
type EmailOAuthProvider = Extract<EmailIntegrationProvider, 'gmail'>;

export interface EmailOAuthProviderConfig {
  authorizationParams: Record<string, string>;
  authorizationUrl: string;
  clientIdEnv: ClientIdEnv;
  clientSecretEnv: ClientSecretEnv;
  displayName: string;
  extractEmail: (userinfo: unknown) => string | null;
  provider: EmailOAuthProvider;
  scopes: readonly string[];
  tokenUrl: string;
  userinfoUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export const GMAIL_EMAIL_OAUTH: EmailOAuthProviderConfig = {
  authorizationParams: {
    access_type: 'offline',
    include_granted_scopes: 'true',
  },
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  clientIdEnv: 'GOOGLE_CLIENT_ID',
  clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  displayName: 'Gmail',
  extractEmail: (userinfo) => isRecord(userinfo) && typeof userinfo.email === 'string'
    ? userinfo.email
    : null,
  provider: 'gmail',
  scopes: [
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
};
