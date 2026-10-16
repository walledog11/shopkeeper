import { execFileSync } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const team = process.argv.find(arg => arg.startsWith('--team='))?.slice(7) || 'my-team';
const formUrl = process.argv.find(arg => arg.startsWith('--form-url='))?.slice(11);
if (!formUrl) throw new Error('Provide --form-url=https://app.loops.so/api/newsletter-form/FORM_ID');
const parsed = new URL(formUrl);
if (parsed.origin !== 'https://app.loops.so' || !/^\/api\/newsletter-form\/[a-zA-Z0-9]+$/.test(parsed.pathname) || parsed.search || parsed.hash || parsed.username || parsed.password) {
  throw new Error('Expected a public Loops form endpoint.');
}
function cli(...args) {
  try {
    return JSON.parse(execFileSync('loops', [...args, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch {
    // The CLI error object can contain captured credential output. Never log it.
    throw new Error('Loops CLI failed. Check your login and team name.');
  }
}
if (cli('api-key', '--team', team).teamName !== 'shopkeeper') throw new Error('Expected the shopkeeper Loops workspace.');
const { apiKey } = cli('auth', 'get', team);
if (typeof apiKey !== 'string' || !apiKey || /[\r\n"\\]/.test(apiKey)) throw new Error('Unexpected credential format.');
const lists = cli('lists', 'list', '--team', team);
const manifest = JSON.parse(await readFile(new URL('../docs/waitlist/loops-resources.json', import.meta.url), 'utf8'));
const earlyAccess = lists.find(list => list.name.trim().toLowerCase() === 'early access');
const updates = lists.find(list => list.name.trim().toLowerCase() === 'product updates');
const ready = Boolean(earlyAccess && updates && earlyAccess.isPublic && updates.isPublic);
const values = {
  LOOPS_WAITLIST_ENABLED: String(ready),
  LOOPS_API_KEY: apiKey,
  LOOPS_FORM_URL: formUrl,
  LOOPS_EARLY_ACCESS_LIST_ID: earlyAccess?.id ?? '',
  LOOPS_UPDATES_LIST_ID: updates?.id ?? '',
  LOOPS_LAUNCH_CAMPAIGN_ID: manifest.campaigns.launch.id,
};
for (const relative of ['../apps/dashboard/.env.local', '../apps/gateway/.env']) {
  const path = new URL(relative, import.meta.url);
  let content = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'gm');
    const line = `${key}="${value}"`;
    content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
  }
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}
console.log(`Saved Loops credentials in the ignored dashboard and gateway environment files. Email sync ${ready ? 'enabled' : 'disabled until both public lists exist'}. No credential values were printed.`);
