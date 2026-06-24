import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { shopifyRestJson, type ShopifyContext } from '@shopkeeper/agent/shopify';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export const POST = withOrgRoute(
  { context: 'Shopify KB sync POST', errorMessage: 'Failed to sync Shopify KB', requireBillingWriteAllowed: true },
  async ({ org }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });
    if (!integration?.accessToken) {
      throw new BadRequestError('No Shopify integration connected');
    }

    const ctx: ShopifyContext = { shop: integration.externalAccountId, accessToken: integration.accessToken };

    let policies: { id: number; title: string; body: string }[];
    let pages: { id: number; title: string; body_html: string }[];
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

    const shopifyKbInitial = await db.knowledgeBase.findFirst({
      where: { organizationId: org.id, source: 'shopify' },
    });

    // Find or create the org's Shopify knowledge base
    let shopifyKb = shopifyKbInitial;
    if (!shopifyKb) {
      shopifyKb = await db.knowledgeBase.create({
        data: { organizationId: org.id, name: 'Shopify', source: 'shopify' },
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
        data: { organizationId: org.id, knowledgeBaseId: shopifyKb.id, title: policy.title, body, tags: [tag] },
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
        data: { organizationId: org.id, knowledgeBaseId: shopifyKb.id, title: page.title, body, tags: [tag] },
      });
    });

    await Promise.all([...policyOps, ...pageOps]);

    return NextResponse.json({ syncedPolicies: filteredPolicies.length, syncedPages: filteredPages.length });
  },
);
