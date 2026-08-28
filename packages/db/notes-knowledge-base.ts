import type { Prisma } from '@prisma/client';
import { db } from './client.js';

export const NOTES_KB_SINGLETON_KEY = 'user:notes' as const;

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2002';
}

/**
 * Resolve the product-owned Notes singleton without exposing Prisma's
 * find/create race to callers. Prisma can emulate a compound-key upsert as
 * separate statements, so simultaneous first writers may still produce P2002;
 * the losing writer then reads the row that won the unique-key race.
 */
export async function getOrCreateNotesKnowledgeBase(organizationId: string) {
  const unique = {
    organizationId_singletonKey: {
      organizationId,
      singletonKey: NOTES_KB_SINGLETON_KEY,
    },
  } as const;

  try {
    return await db.knowledgeBase.upsert({
      where: unique,
      update: {},
      create: {
        organizationId,
        name: 'Notes',
        source: 'user',
        singletonKey: NOTES_KB_SINGLETON_KEY,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return db.knowledgeBase.findUniqueOrThrow({ where: unique });
  }
}
