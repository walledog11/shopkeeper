import { getEmailProvider } from '../providers.js';
import type { EmailIntegrationLike, EmailSender } from '../types.js';
import { PostmarkSender } from './postmark.js';
import { GmailSender } from './gmail.js';

export { PostmarkSender } from './postmark.js';
export { GmailSender, type GmailIntegration } from './gmail.js';

export function getEmailSender(integration: EmailIntegrationLike): EmailSender {
  const provider = getEmailProvider(integration);
  switch (provider) {
    case 'postmark':
      return new PostmarkSender();
    case 'gmail':
      return new GmailSender(integration);
  }
}
