import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import type { Db } from './db/pool.js';
import { healthRouter } from './routes/health.js';
import { metaRouter } from './routes/meta.js';
import { HttpError, runsRouter, type RunsDeps } from './routes/runs.js';

export type AppDeps = {
  db: Pick<Db, 'ping'>;
  corsOrigins: string[];
  version: string;
  aiFallback: 'on' | 'off';
  /** Runs API; omitted in tests that only exercise health. */
  runs?: RunsDeps;
  limits?: { maxDiscover: number; maxCsvRows: number; recommendedRows: number };
};

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.corsOrigins, exposedHeaders: ['Content-Disposition', 'X-Row-Count'] }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', healthRouter(deps));
  app.use('/api', metaRouter(deps.limits ?? { maxDiscover: 40, maxCsvRows: 200, recommendedRows: 50 }));
  if (deps.runs) app.use('/api', runsRouter(deps.runs));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      res.status(tooBig ? 413 : 400).json({
        error: { code: tooBig ? 'FILE_TOO_LARGE' : 'BAD_UPLOAD', message: tooBig ? 'The file is larger than 2 MB.' : err.message },
      });
      return;
    }
    if ((err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
      return;
    }
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server' } });
  };
  app.use(onError);

  return app;
}
