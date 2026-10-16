import { Router } from 'express';
import type { Db } from '../db/pool.js';

export function healthRouter(deps: { db: Pick<Db, 'ping'>; version: string; aiFallback: 'on' | 'off' }): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    try {
      await deps.db.ping();
      res.json({ ok: true, db: 'up', version: deps.version, aiFallback: deps.aiFallback });
    } catch {
      res.status(503).json({ ok: false, db: 'down', version: deps.version, aiFallback: deps.aiFallback });
    }
  });
  return router;
}
