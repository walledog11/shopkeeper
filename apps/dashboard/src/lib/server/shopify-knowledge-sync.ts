import { db } from '@shopkeeper/db';
import { fetchShopifyStoreContent } from '@shopkeeper/agent/shopify';
import { memoryOverrideTargetTag } from '@shopkeeper/agent/kb-memory';
import { shopifyContextFor } from '@shopkeeper/agent/shopify/access';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { isSimulatedShopifyIntegration } from '@/lib/integrations/shopify-simulator';

function isSyncTag(tag: string): boolean {
  return tag.startsWith('shopify:policy:') || tag.startsWith('shopify:page:');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

/**
 * Copies the store's published policies and pages into the workspace's Shopify
 * knowledge base: notes synced before are updated, and notes for anything the
 * store no longer publishes are removed, so the agent never quotes a policy the
 * merchant took down. Run from the dashboard and from the app home inside
 * Shopify admin.
 */
export async function syncShopifyKnowledge(organizationId: string) {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
  });
  if (!integration?.accessToken) {
    throw new BadRequestError('No Shopify integration connected');
  }

  let policies: { id: string; title: string; body: string }[];
  let pages: { id: string; title: string; body: string }[];
  if (isSimulatedShopifyIntegration(integration.metadata)) {
    policies = [
      {
        id: 'demo-returns',
        title: 'Demo return policy',
        body: '<p>Unused items can be returned within 30 days. Contact support before sending anything back.</p>',
      },
    ];
    pages = [
      {
        id: 'demo-shipping',
        title: 'Demo shipping information',
        body: '<p>Orders ship within two business days. Tracking is emailed after fulfillment.</p>',
      },
    ];
  } else {
    const ctx = await shopifyContextFor(integration);
    if (!ctx) throw new BadRequestError('Shopify needs reconnecting');
    try {
      ({ policies, pages } = await fetchShopifyStoreContent(ctx));
    } catch {
      throw new ApiError('Failed to fetch data from Shopify', 502);
    }
  }

  const shopifyKbInitial = await db.knowledgeBase.findFirst({
    where: { organizationId, source: 'shopify' },
  });

  // Find or create the org's Shopify knowledge base
  let shopifyKb = shopifyKbInitial;
  if (!shopifyKb) {
    shopifyKb = await db.knowledgeBase.create({
      data: { organizationId, name: 'Shopify', source: 'shopify' },
    });
  }

  // Build lookup map of existing synced articles by their shopify tag
  const existingArticles = await db.kbArticle.findMany({
    where: { knowledgeBaseId: shopifyKb.id },
    select: { id: true, tags: true },
  });
  const tagToId = new Map<string, string>();
  for (const a of existingArticles) {
    for (const t of a.tags) {
      if (isSyncTag(t)) tagToId.set(t, a.id);
    }
  }

  const filteredPolicies = policies.filter(p => p.body);
  const filteredPages = pages.filter(p => p.body);
  const notes = [
    ...filteredPolicies.map(policy => ({ tag: `shopify:policy:${policy.id}`, title: policy.title, body: stripHtml(policy.body) })),
    ...filteredPages.map(page => ({ tag: `shopify:page:${page.id}`, title: page.title, body: stripHtml(page.body) })),
  ];
  const current = new Set(notes.map(note => note.tag));

  await Promise.all(notes.map(note => {
    const existingId = tagToId.get(note.tag);
    return existingId
      ? db.kbArticle.update({ where: { id: existingId }, data: { title: note.title, body: note.body } })
      : db.kbArticle.create({
          data: { organizationId, knowledgeBaseId: shopifyKb.id, title: note.title, body: note.body, tags: [note.tag] },
        });
  }));

  // Only notes this sync wrote; anything else in the folder is the merchant's.
  const removed = existingArticles
    .filter(article => article.tags.some(isSyncTag) && !article.tags.some(tag => current.has(tag)))
    .map(article => article.id);
  if (removed.length > 0) {
    // A correction the merchant wrote on a removed note goes with it, as when
    // they delete a note themselves.
    await db.$transaction([
      db.kbArticle.deleteMany({
        where: { organizationId, OR: removed.map(id => ({ tags: { has: memoryOverrideTargetTag(id) } })) },
      }),
      db.kbArticle.deleteMany({ where: { id: { in: removed }, knowledgeBaseId: shopifyKb.id } }),
    ]);
  }

  return { syncedPolicies: filteredPolicies.length, syncedPages: filteredPages.length };
}
