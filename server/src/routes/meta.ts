import { Router } from 'express';
import { DEFAULT_WEIGHTS } from '../score/index.js';
import { US_STATES } from '../sources/states.js';
import { TRADES } from '../sources/trades.js';

export function metaRouter(limits: { maxDiscover: number; maxCsvRows: number; recommendedRows: number }): Router {
  const router = Router();
  router.get('/meta', (_req, res) => {
    res.json({
      trades: TRADES.map((t) => ({ key: t.key, label: t.label, osmTag: `${t.osm.key}=${t.osm.value}` })),
      states: US_STATES,
      limits,
      defaultWeights: DEFAULT_WEIGHTS,
      tiers: { A: '70–100', B: '45–69', C: '0–44' },
    });
  });
  return router;
}
