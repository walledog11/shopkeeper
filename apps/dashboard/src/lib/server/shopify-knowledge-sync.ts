import { db } from '@shopkeeper/db';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import { shopifyContextFor } from '@shopkeeper/agent/shopify/access';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { isSimulatedShopifyIntegration } from '@/lib/integrations/shopify-simulator';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

/**
 * Copies the store's published policies and pages into the workspace's Shopify
 * knowledge base, updating notes synced before. Run from the dashboard and from
 * the app home inside Shopify admin.
 */
export async function syncShopifyKnowledge(organizationId: string) {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
  });
  if (!integration?.accessToken) {
    throw new BadRequestError('No Shopify integration connected');
  }

  let policies: { id: number; title: string; body: string }[];
  let pages: { id: number; title: string; body_html: string }[];
  if (isSimulatedShopifyIntegration(integration.metadata)) {
    policies = [
      {
        id: -1,
        title: 'Demo return policy',
        body: '<p>Unused items can be returned within 30 days. Contact support before sending anything back.</p>',
      },
    ];
    pages = [
      {
        id: -1,
        title: 'Demo shipping information',
        body_html: '<p>Orders ship within two business days. Tracking is emailed after fulfillment.</p>',
      },
    ];
  } else {
    const ctx = await shopifyContextFor(integration);
    if (!ctx) throw new BadRequestError('Shopify needs reconnecting');
    try {
      const [policiesData, pagesData] = await Promise.all([
        shopifyRestJson<{ policies?: { id: number; title: string; body: string }[] }>(ctx, 'policies.json', { maxRetries: 0 }),
        shopifyRestJson<{ pages?: { id: number; title: string; body_html: string }[] }>(ctx, 'pages.json', {
          query: { published_status: 'published', limit: 250 },
          maxRetries: 0,
        }),
      ]);
      policies = policiesData.policies ?? [];
      pages = pagesData.pages ?? [];
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
      if (t.startsWith('shopify:policy:') || t.startsWith('shopify:page:')) {
        tagToId.set(t, a.id);
      }
    }
  }

  const filteredPolicies = (policies ?? []).filter(p => p.body);
  const filteredPages = (pages ?? []).filter(p => p.body_html);

  const policyOps = filteredPolicies.map(policy => {
    const tag = `shopify:policy:${policy.id}`;
    const body = stripHtml(policy.body);
    const existingId = tagToId.get(tag);
    if (existingId) {
      return db.kbArticle.update({ where: { id: existingId }, data: { title: policy.title, body } });
    }
    return db.kbArticle.create({
      data: { organizationId, knowledgeBaseId: shopifyKb.id, title: policy.title, body, tags: [tag] },
    });
  });

  const pageOps = filteredPages.map(page => {
    const tag = `shopify:page:${page.id}`;
    const body = stripHtml(page.body_html);
    const existingId = tagToId.get(tag);
    if (existingId) {
      return db.kbArticle.update({ where: { id: existingId }, data: { title: page.title, body } });
    }
    return db.kbArticle.create({
      data: { organizationId, knowledgeBaseId: shopifyKb.id, title: page.title, body, tags: [tag] },
    });
  });

  await Promise.all([...policyOps, ...pageOps]);

  return { syncedPolicies: filteredPolicies.length, syncedPages: filteredPages.length };
}
