import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient instance to avoid connection exhaustion
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown — close DB connection pool
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
