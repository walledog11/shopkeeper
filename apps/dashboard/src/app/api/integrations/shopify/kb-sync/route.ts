import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export const POST = withOrgRoute(
  { context: 'Shopify KB sync POST', errorMessage: 'Failed to sync Shopify KB' },
  async ({ org }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });
    if (!integration?.accessToken) {
      throw new BadRequestError('No Shopify integration connected');
    }

    const { externalAccountId: shop, accessToken } = integration;
    const headers = { 'X-Shopify-Access-Token': accessToken };

    const [policiesRes, pagesRes] = await Promise.all([
      fetch(`https://${shop}/admin/api/2026-04/policies.json`, { headers }),
      fetch(`https://${shop}/admin/api/2026-04/pages.json?published_status=published&limit=250`, { headers }),
    ]);

    if (!policiesRes.ok || !pagesRes.ok) {
      throw new ApiError('Failed to fetch data from Shopify', 502);
    }

    const [{ policies }, { pages }] = await Promise.all([
      policiesRes.json() as Promise<{ policies: { id: number; title: string; body: string }[] }>,
      pagesRes.json() as Promise<{ pages: { id: number; title: string; body_html: string }[] }>,
    ]);

    // Find or create the org's Shopify knowledge base
    let shopifyKb = await db.knowledgeBase.findFirst({
      where: { organizationId: org.id, source: 'shopify' },
    });
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
