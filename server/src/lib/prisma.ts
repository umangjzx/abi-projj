import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * A single PrismaClient per process. In development `tsx watch` re-evaluates
 * modules on every change, so the instance is cached on `globalThis` to avoid
 * exhausting the database connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev
      ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
      : [{ emit: 'event', level: 'error' }],
  });

prisma.$on('error' as never, (e: Prisma.LogEvent) => logger.error({ prisma: e }, 'prisma error'));
prisma.$on('warn' as never, (e: Prisma.LogEvent) => logger.warn({ prisma: e }, 'prisma warning'));

if (!env.isProd) globalForPrisma.prisma = prisma;

export { Prisma };
