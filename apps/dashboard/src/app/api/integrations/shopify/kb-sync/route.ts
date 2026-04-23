import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export async function POST() {
  try {
    const org = await getOrCreateOrg();

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });
    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'No Shopify integration connected' }, { status: 400 });
    }

    const { externalAccountId: shop, accessToken } = integration;
    const headers = { 'X-Shopify-Access-Token': accessToken };

    const [policiesRes, pagesRes] = await Promise.all([
      fetch(`https://${shop}/admin/api/2024-01/policies.json`, { headers }),
      fetch(`https://${shop}/admin/api/2024-01/pages.json?published_status=published&limit=250`, { headers }),
    ]);

    if (!policiesRes.ok || !pagesRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch data from Shopify' }, { status: 502 });
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
  } catch (error) {
    return handleApiError(error, 'Shopify KB sync POST', 'Failed to sync Shopify KB');
  }
}
