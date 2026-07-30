import { logger } from '../lib/logger';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { analyticsService } from '../modules/analytics/analytics.service';
import { customerService } from '../modules/customers/customer.service';
import { recommendationService } from '../modules/recommendations/recommendation.service';
import { inventoryService } from '../modules/inventory/inventory.service';

/**
 * Lightweight in-process scheduler. Deliberately plain `setInterval` rather
 * than a cron library or queue: this deployment runs a single API instance, and
 * every job below is idempotent, so a missed or repeated run is harmless.
 *
 * If the app is ever scaled to multiple instances these should move to an
 * external scheduler (Render Cron / a queue) to avoid duplicate execution --
 * see docs/DEPLOYMENT.md.
 */
const HOUR = 3_600_000;
const timers: NodeJS.Timeout[] = [];

interface Job {
  name: string;
  intervalMs: number;
  /** Run once shortly after boot as well as on the interval. */
  runOnStart?: boolean;
  handler: () => Promise<unknown>;
}

const jobs: Job[] = [
  {
    name: 'analytics:daily-snapshot',
    intervalMs: HOUR,
    runOnStart: true,
    // Re-writing today's snapshot hourly keeps the dashboard's snapshot view
    // current without a heavy nightly batch.
    handler: async () => {
      const today = await analyticsService.writeDailySnapshot(new Date());
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await analyticsService.writeDailySnapshot(yesterday);
      return today;
    },
  },
  {
    name: 'customers:recompute-segments',
    intervalMs: 12 * HOUR,
    runOnStart: true,
    handler: () => customerService.recomputeSegments(),
  },
  {
    name: 'recommendations:rebuild-affinities',
    intervalMs: 6 * HOUR,
    handler: () => recommendationService.rebuildAllAffinities(),
  },
  {
    name: 'recommendations:clear-expired',
    intervalMs: 2 * HOUR,
    handler: async () => ({ removed: await recommendationService.clearExpired() }),
  },
  {
    name: 'inventory:low-stock-sweep',
    intervalMs: 6 * HOUR,
    handler: async () => {
      const alerts = await inventoryService.lowStockAlerts(50);
      // Only notify for items with no open alert in the last 24 hours, so the
      // admin is not re-notified about the same SKU every six hours.
      const since = new Date(Date.now() - 24 * HOUR);
      const recent = await prisma.notification.findMany({
        where: { audience: 'ADMIN', type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] }, createdAt: { gte: since } },
        select: { meta: true },
      });
      const alreadyNotified = new Set(
        recent.map((r) => (r.meta as { variantId?: string } | null)?.variantId).filter(Boolean) as string[],
      );
      const fresh = alerts.filter((a) => !alreadyNotified.has(a.variantId));
      if (fresh.length) await inventoryService.checkLowStock(fresh.map((f) => f.variantId));
      return { checked: alerts.length, notified: fresh.length };
    },
  },
  {
    name: 'auth:purge-stale-tokens',
    intervalMs: 12 * HOUR,
    handler: async () => {
      const now = new Date();
      const [tokens, otps] = await Promise.all([
        prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(Date.now() - 30 * 24 * HOUR) } }] } }),
        prisma.otpToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * HOUR) } } }),
      ]);
      return { refreshTokens: tokens.count, otpTokens: otps.count };
    },
  },
];

async function run(job: Job) {
  const startedAt = Date.now();
  try {
    const result = await job.handler();
    logger.info({ job: job.name, ms: Date.now() - startedAt, result }, 'scheduled job completed');
  } catch (err) {
    // A failing job must never take the API process down.
    logger.error({ err, job: job.name }, 'scheduled job failed');
  }
}

export function startScheduledJobs() {
  if (env.isTest) return;

  for (const job of jobs) {
    if (job.runOnStart) {
      // Stagger the initial runs so boot is not competing with first requests.
      const delay = 15_000 + jobs.indexOf(job) * 5_000;
      timers.push(setTimeout(() => void run(job), delay));
    }
    const timer = setInterval(() => void run(job), job.intervalMs);
    // Don't hold the event loop open on shutdown.
    timer.unref?.();
    timers.push(timer);
  }

  logger.info({ jobs: jobs.map((j) => j.name) }, `scheduler started with ${jobs.length} job(s)`);
}

export function stopScheduledJobs() {
  for (const timer of timers) {
    clearInterval(timer as NodeJS.Timeout);
    clearTimeout(timer as NodeJS.Timeout);
  }
  timers.length = 0;
}
