import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startScheduledJobs, stopScheduledJobs } from './jobs/scheduler';

async function bootstrap() {
  // Fail fast with a clear message rather than surfacing DB errors per-request.
  try {
    await prisma.$connect();
    logger.info('database connection established');
  } catch (err) {
    logger.error({ err }, 'could not connect to the database -- check DATABASE_URL and that PostgreSQL is running');
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      `Thuthi Dairy API listening on http://localhost:${env.PORT}${env.API_PREFIX} [${env.NODE_ENV}]`,
    );
    if (!env.mailEnabled) logger.warn('SMTP not configured -- emails are written to storage/mail-outbox.log');
    if (!env.cloudinaryEnabled) logger.warn('Cloudinary not configured -- uploads are stored on local disk');
  });

  startScheduledJobs();

  // ------------------------------------------------------ graceful shutdown ---
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    stopScheduledJobs();

    // Stop accepting new connections, then release the DB pool.
    server.close(async () => {
      await prisma.$disconnect().catch(() => undefined);
      process.exit(0);
    });

    // Don't hang forever on a stuck keep-alive connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled promise rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception -- exiting');
    process.exit(1);
  });
}

void bootstrap();
