import { getEmailProvider } from '../providers.js';
import type { EmailIntegrationLike, EmailSender } from '../types.js';
import { PostmarkSender } from './postmark.js';
import { GmailSender } from './gmail.js';
import { OutlookSender } from './outlook.js';

export { PostmarkSender } from './postmark.js';
export { GmailSender, type GmailIntegration } from './gmail.js';
export { OutlookSender, type OutlookIntegration } from './outlook.js';

export function getEmailSender(integration: EmailIntegrationLike): EmailSender {
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
