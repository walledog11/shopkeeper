import { PrismaClient } from '@prisma/client';

// 1. Instantiate the Prisma Client
// We use a global variable in development to prevent Next.js hot-reloading 
// from exhausting your database connection limit by creating new instances every save.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// 2. Export the Prisma types used across the monorepo
export { Prisma, SenderType, ChannelType } from '@prisma/client';