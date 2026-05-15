import { PostmarkSender } from './postmark';
import { GmailSender } from './gmail';
import { OutlookSender } from './outlook';
import type { EmailProvider, EmailSender } from './types';
import { getEmailProvider } from './providers';

export type { EmailProvider, EmailSender, OutboundEmail, EmailHeader } from './types';
export { EmailNotConfiguredError } from './types';
export {
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
  isOAuthEmailProvider,
} from './providers';

interface IntegrationLike {
  id: string;
  metadata: unknown;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export function getEmailSender(integration: IntegrationLike): EmailSender {
  const provider = getEmailProvider(integration);
  switch (provider) {
    case 'postmark':
      return new PostmarkSender();
    case 'gmail':
      return new GmailSender(integration);
    case 'outlook':
      return new OutlookSender(integration);
  }
}
