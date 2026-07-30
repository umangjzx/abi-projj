import path from 'node:path';
import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { ok } from './lib/http';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { globalLimiter, issueCsrfToken, sanitizePayload } from './middleware/security';
import { UPLOAD_DIR } from './lib/storage';

export function createApp(): Application {
  const app = express();

  // Render/Railway/Vercel sit behind a proxy; without this `req.ip` is the
  // proxy address and rate limiting would bucket every user together.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ------------------------------------------------------------- security ---
  app.use(
    helmet({
      // The API serves JSON and images only; a strict CSP here would not affect
      // the SPA (served by Vercel) but does harden the /uploads image routes.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/server-to-server requests carry no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    }),
  );

  // --------------------------------------------------------------- parsing ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(compression());
  app.use(sanitizePayload);
  app.use(issueCsrfToken);

  // --------------------------------------------------------------- logging ---
  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        // Health checks would otherwise dominate the log stream.
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/' },
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      }),
    );
  }

  app.use(globalLimiter);

  // ----------------------------------------------------------------- static ---
  // Only used when Cloudinary is not configured.
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));

  // ------------------------------------------------------------- meta routes ---
  app.get('/health', (_req, res) =>
    ok(res, {
      status: 'ok',
      service: 'thuthi-dairy-api',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get('/', (_req, res) =>
    ok(res, {
      name: 'Thuthi Dairy Private Limited -- Market Analysis & Recommendation API',
      version: '1.0.0',
      docs: 'See docs/API.md',
      apiBase: env.API_PREFIX,
    }),
  );

  // ------------------------------------------------------------------- API ---
  app.use(env.API_PREFIX, apiRouter);

  // Serve the built SPA when the API and client are deployed as one service.
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  if (env.isProd) {
    app.use(express.static(clientDist, { maxAge: '1d' }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
