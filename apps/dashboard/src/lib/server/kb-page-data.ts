import { db, parseVoiceProposal } from '@shopkeeper/db';
import { normalizeStoredOrgSettings } from '@shopkeeper/agent/settings';
import type { KnowledgeBase, VoiceProposal } from '@/types';

export interface KbPageData {
  knowledgeBases: KnowledgeBase[];
  storeProfile: {
    name: string;
    aiContext: string;
    brandVoice: string;
    voiceProposal: VoiceProposal | null;
  };
}

export async function getKbPageData(org: {
  id: string;
  name: string;
  settings: unknown;
  voiceProposal: unknown;
}): Promise<KbPageData> {
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

  const settings = normalizeStoredOrgSettings(org.settings);
  return {
    knowledgeBases: enriched.map(kb => ({
      ...kb,
      createdAt: kb.createdAt.toISOString(),
      articles: kb.articles.map(article => ({
        ...article,
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
        lastCitedAt: article.lastCitedAt?.toISOString() ?? null,
      })),
    })) as KnowledgeBase[],
    storeProfile: {
      name: org.name,
      aiContext: settings.aiContext ?? '',
      brandVoice: settings.brandVoice ?? '',
      voiceProposal: parseVoiceProposal(org.voiceProposal),
    },
  };
}
