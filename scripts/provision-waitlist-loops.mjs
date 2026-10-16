import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = new URL('../docs/waitlist/loops-resources.json', import.meta.url);
const team = process.argv.find(arg => arg.startsWith('--team='))?.slice(7) || 'my-team';
let nextRequestAt = 0;
function cli(...args) {
  const delay = Math.max(0, nextRequestAt - Date.now());
  if (delay) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
  nextRequestAt = Date.now() + 1100;
  return JSON.parse(execFileSync('loops', [...args, '--team', team, '--output', 'json'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
}
const workspace = cli('api-key');
if (workspace.teamName !== 'shopkeeper') throw new Error('Expected the shopkeeper Loops workspace.');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
async function save() { await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`); }

const properties = {
  waitlistStage: 'string', waitlistJoinedAt: 'date', waitlistConsentVersion: 'string',
  waitlistSource: 'string', newsletterOptIn: 'boolean', utmSource: 'string', utmMedium: 'string', utmCampaign: 'string',
};
const existingProperties = cli('contact-properties', 'list', '--custom');
for (const [name, type] of Object.entries(properties)) {
  if (!existingProperties.some(property => property.key === name || property.name === name)) {
    cli('contact-properties', 'create', '--name', name, '--type', type);
  }
}
manifest.properties = properties;
await save();

const lists = cli('lists', 'list');
for (const list of lists.filter(list => ['early access', 'product updates'].includes(list.name.trim().toLowerCase()))) {
  if (!list.isPublic) throw new Error(`${list.name} must be public before it can be used by the signup form.`);
}
manifest.lists = Object.fromEntries(['Early access', 'Product updates'].map(name => [name, lists.find(list => list.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null]));
const segments = cli('audience-segments', 'list', '--per-page', '50');
manifest.segments ??= {};
for (const [name, key, value] of [
  ['Shopkeeper — waiting for early access', 'waitlistStage', 'waiting'],
  ['Shopkeeper — product updates', 'newsletterOptIn', true],
  ['Shopkeeper — signed up', 'waitlistStage', 'signed_up'],
]) {
  const existing = segments.find(segment => segment.name === name);
  const condition = typeof value === 'boolean' ? { type: 'property', key, operator: 'isTrue' } : { type: 'property', key, operator: 'equals', value };
  const segment = existing ?? cli('audience-segments', 'create', '--name', name, '--filter', JSON.stringify({ match: 'all', conditions: [condition] }));
  manifest.segments[name] = segment.id;
  await save();
}

if (!manifest.themeId) {
  const existing = cli('themes', 'list', '--per-page', '50').find(theme => theme.name === 'Shopkeeper — waitlist');
  const theme = existing ?? cli('themes', 'create', '--name', 'Shopkeeper — waitlist', '--styles-file', 'docs/waitlist/theme.json');
  manifest.themeId = theme.id;
  await save();
}

async function fillEmail(id, template, subject, previewText) {
  const current = cli('email-messages', 'get', id);
  const content = (await readFile(new URL(`../docs/waitlist/emails/${template}.lmx`, import.meta.url), 'utf8')).replace('{{themeId}}', manifest.themeId);
  cli('email-messages', 'update', id, '--expected-revision-id', current.contentRevisionId,
    '--subject', subject, '--preview-text', previewText, '--from-name', 'Rajbir at Shopkeeper',
    '--from-email', 'hello', '--reply-to', 'hello@useshopkeeper.com', '--lmx', content);
}

manifest.campaigns ??= {};
const campaigns = cli('campaigns', 'list', '--per-page', '50');
for (const [template, name, list, segment, subject, previewText] of [
  ['product-update', 'Shopkeeper — development update (draft)', 'Product updates', 'Shopkeeper — product updates', 'A closer look at Shopkeeper', 'The work behind a simple customer question.'],
  ['launch', 'Shopkeeper — early access launch (send when ready)', 'Early access', 'Shopkeeper — waiting for early access', 'Shopkeeper early access is open', 'Your invitation to give your shop a shopkeeper.'],
]) {
  let campaign = campaigns.find(item => item.id === manifest.campaigns[template]?.id || item.name === name);
  if (!campaign) campaign = cli('campaigns', 'create', '--name', name, '--audience-segment-id', manifest.segments[segment]);
  if (campaign.status !== 'Draft') throw new Error(`Refusing to edit a non-draft ${template} campaign.`);
  if (manifest.lists[list]) cli('campaigns', 'update', campaign.id, '--mailing-list-id', manifest.lists[list]);
  manifest.campaigns[template] = { id: campaign.id, emailMessageId: campaign.emailMessageId, url: campaign.url };
  await save();
  await fillEmail(campaign.emailMessageId, template, subject, previewText);
}

let workflow = cli('workflows', 'list', '--per-page', '50').find(item => item.id === manifest.welcome?.id || item.name === 'Shopkeeper — waitlist welcome');
if (!workflow) workflow = cli('workflows', 'create', '--name', 'Shopkeeper — waitlist welcome', '--description', 'Welcome confirmed early-access subscribers. Activate after end-to-end testing.');
workflow = cli('workflows', 'get', workflow.id);
if (workflow.status !== 'Draft') throw new Error('Refusing to edit an active welcome workflow.');
manifest.welcome = { id: workflow.id, url: workflow.url };
await save();
if (manifest.lists['Early access'] && workflow.mailingListId !== manifest.lists['Early access']) {
  cli('workflows', 'change-mailing-list', workflow.id, '--mailing-list-id', manifest.lists['Early access'], '--expected-revision-id', workflow.workflowRevisionId);
  workflow = cli('workflows', 'get', workflow.id);
}
if (manifest.lists['Early access']) {
  cli('workflows', 'nodes', 'update', workflow.id, workflow.rootNodeId,
    '--expected-revision-id', workflow.workflowRevisionId,
    '--payload-file', 'docs/waitlist/welcome-trigger.json');
  workflow = cli('workflows', 'get', workflow.id);
}
let emailNode = Object.values(workflow.nodes).find(node => node.typeName === 'SendEmailAction');
if (!emailNode) {
  const rootNode = workflow.nodes[workflow.rootNodeId];
  const args = rootNode.nextNodeIds.length
    ? ['--insert-mode', 'between', '--from-node-id', workflow.rootNodeId, '--to-node-id', rootNode.nextNodeIds[0]]
    : ['--insert-mode', 'after', '--from-node-id', workflow.rootNodeId];
  cli('workflows', 'nodes', 'create', workflow.id, '--node-type', 'SendEmailAction', '--expected-revision-id', workflow.workflowRevisionId, ...args);
  workflow = cli('workflows', 'get', workflow.id);
  emailNode = Object.values(workflow.nodes).find(node => node.typeName === 'SendEmailAction');
}
if (!emailNode?.emailMessageId) throw new Error('Welcome workflow has no email message.');
manifest.welcome.emailMessageId = emailNode.emailMessageId;
await save();
await fillEmail(emailNode.emailMessageId, 'welcome', 'You’re on the Shopkeeper waitlist', 'Thanks for being here. Here’s what happens next.');
console.log(JSON.stringify({ workspace: workspace.teamName, ...manifest, note: 'All emails remain drafts. No emails were sent.' }, null, 2));
