import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { withOrgRoute } from '@/lib/api/route';

export const GET = withOrgRoute(
  { context: 'KB GET', errorMessage: 'Failed to fetch knowledge bases' },
  async ({ org }) => {
    const knowledgeBases = await db.knowledgeBase.findMany({
      where: { organizationId: org.id },
      include: { articles: { orderBy: { updatedAt: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [allTime, lastWeek] = await Promise.all([
      db.kbCitation.groupBy({
        by: ['kbArticleId'],
        where: { organizationId: org.id },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      db.kbCitation.groupBy({
        by: ['kbArticleId'],
        where: { organizationId: org.id, createdAt: { gte: weekAgo } },
        _count: { _all: true },
      }),
    ]);

    const totalByArticle = new Map(allTime.map(r => [r.kbArticleId, { count: r._count._all, lastCitedAt: r._max.createdAt }]));
    const weekByArticle = new Map(lastWeek.map(r => [r.kbArticleId, r._count._all]));

    const enriched = knowledgeBases.map(kb => ({
      ...kb,
      articles: kb.articles.map(a => ({
        ...a,
        citationCount: totalByArticle.get(a.id)?.count ?? 0,
        citationCountWeek: weekByArticle.get(a.id) ?? 0,
        lastCitedAt: totalByArticle.get(a.id)?.lastCitedAt ?? null,
      })),
    }));

    return NextResponse.json({ knowledgeBases: enriched });
  },
);
