import { createRequire } from 'node:module';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import { decryptToken, encryptToken } from './crypto.js';
import { PrismaClient } from './prisma-enums.js';

const require = createRequire(import.meta.url);

const globalForPrisma = globalThis as typeof globalThis & {
  prisma: ClerkDb | undefined;
};

const TOKEN_FIELDS = ['accessToken', 'refreshToken'] as const;

function encryptFieldInput(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string') return encryptToken(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const op = value as Record<string, unknown>;
    if ('set' in op) {
      return { ...op, set: typeof op.set === 'string' ? encryptToken(op.set) : op.set };
    }
  }
  return value;
}

function encryptTokenFieldsInPayload<T extends Record<string, unknown> | undefined>(payload: T): T {
  if (!payload) return payload;
  const next: Record<string, unknown> = { ...payload };
  for (const field of TOKEN_FIELDS) {
    if (field in next) next[field] = encryptFieldInput(next[field]);
  }
  return next as T;
}

function transformWriteArgs(operation: string, args: unknown): unknown {
  if (!args || typeof args !== 'object') return args;
  const obj = args as Record<string, unknown>;
  if (operation === 'create' || operation === 'update' || operation === 'updateMany') {
    if ('data' in obj) {
      const data = obj.data;
      const nextData = Array.isArray(data)
        ? data.map((row) => encryptTokenFieldsInPayload(row as Record<string, unknown>))
        : encryptTokenFieldsInPayload(data as Record<string, unknown>);
      return { ...obj, data: nextData };
    }
  }
  if (operation === 'createMany') {
    if ('data' in obj) {
      const data = obj.data;
      const nextData = Array.isArray(data)
        ? data.map((row) => encryptTokenFieldsInPayload(row as Record<string, unknown>))
        : encryptTokenFieldsInPayload(data as Record<string, unknown>);
      return { ...obj, data: nextData };
    }
  }
  if (operation === 'upsert') {
    return {
      ...obj,
      ...(obj.create ? { create: encryptTokenFieldsInPayload(obj.create as Record<string, unknown>) } : {}),
      ...(obj.update ? { update: encryptTokenFieldsInPayload(obj.update as Record<string, unknown>) } : {}),
    };
  }
  return args;
}

function decryptIntegrationRow(row: unknown): void {
  if (!row || typeof row !== 'object') return;
  const obj = row as Record<string, unknown>;
  for (const field of TOKEN_FIELDS) {
    if (field in obj && typeof obj[field] === 'string') {
      obj[field] = decryptToken(obj[field] as string);
    }
  }
}

function decryptResultRows(result: unknown): unknown {
  if (result == null) return result;
  if (Array.isArray(result)) {
    for (const row of result) decryptIntegrationRow(row);
    return result;
  }
  if (typeof result === 'object') {
    decryptIntegrationRow(result);
  }
  return result;
}

function createClient() {
  const log = (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']) as ('query' | 'error' | 'warn')[];
  let base: PrismaClientType;
  if (process.env.NEON_SERVERLESS_HTTP === 'true' && process.env.NODE_ENV !== 'test') {
    const { PrismaNeon } = require('@prisma/adapter-neon') as typeof import('@prisma/adapter-neon');
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    base = new PrismaClient({ adapter, log });
  } else {
    base = new PrismaClient({ log });
  }

  return base.$extends({
    query: {
      integration: {
        async $allOperations({ args, query, operation }) {
          const nextArgs = transformWriteArgs(operation, args);
          const result = await query(nextArgs as never);
          return decryptResultRows(result) as never;
        },
      },
    },
  });
}

export type ClerkDb = ReturnType<typeof createClient>;

const shouldCacheClient = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

export const db: ClerkDb = shouldCacheClient
  ? (globalForPrisma.prisma ?? createClient())
  : createClient();

if (shouldCacheClient) globalForPrisma.prisma = db;
