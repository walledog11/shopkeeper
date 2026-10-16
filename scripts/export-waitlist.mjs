import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const output = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (!output || !process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL and run: npm run waitlist:export -- --out=/private/path/waitlist.csv');
  process.exit(1);
}

const db = new PrismaClient();
function csv(value) {
  let text = String(value ?? '');
  if (/^\s*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

try {
  const entries = await db.waitlistEntry.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const rows = entries.map((entry) => {
    const tags = entry.attribution ?? {};
    return [entry.email, entry.createdAt.toISOString(), entry.source, entry.consentVersion,
      entry.newsletterOptIn, entry.newsletterConsentAt?.toISOString(), entry.emailStatus,
      entry.launchSubscribed, entry.updatesSubscribed, entry.stage,
      entry.invitedAt?.toISOString(), entry.signedUpAt?.toISOString(), entry.loopsSyncedAt?.toISOString(),
      tags.utm_source, tags.utm_medium, tags.utm_campaign].map(csv).join(',');
  });
  const header = 'email,joined_waitlist_at,form,consent_version,newsletter_opt_in,newsletter_consent_at,email_status,launch_subscribed,updates_subscribed,stage,invited_at,signed_up_at,loops_synced_at,utm_source,utm_medium,utm_campaign';
  await writeFile(path.resolve(output), `${[header, ...rows].join('\r\n')}\r\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Exported ${entries.length} waitlist entries to ${path.resolve(output)}`);
} catch (error) {
  console.error(error?.code === 'EEXIST' ? 'That file already exists. Choose another output path.' : 'Export failed. Check DATABASE_URL and the output path.');
  process.exitCode = 1;
} finally { await db.$disconnect(); }
