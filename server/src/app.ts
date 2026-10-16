import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import type { Db } from './db/pool.js';
import { healthRouter } from './routes/health.js';

export type AppDeps = {
  db: Pick<Db, 'ping'>;
  corsOrigins: string[];
  version: string;
  aiFallback: 'on' | 'off';
};

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.corsOrigins, exposedHeaders: ['Content-Disposition', 'X-Row-Count'] }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', healthRouter(deps));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server' } });
  };
  app.use(onError);

  return app;
}
