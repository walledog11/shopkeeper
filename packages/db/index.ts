import { PrismaClient } from '@prisma/client';
import { PrismaNeonHTTP } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const log = (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']) as ('query' | 'error' | 'warn')[];
  if (process.env.NEON_SERVERLESS_HTTP === 'true') {
    neonConfig.fetchFunction = globalThis.fetch;
    const adapter = new PrismaNeonHTTP(process.env.DATABASE_URL!, {});
    return new PrismaClient({ adapter, log });
  }
  return new PrismaClient({ log });
}

export const db =
  globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export { Prisma, SenderType, ChannelType } from '@prisma/client';
