import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Repo } from '../db/repo.js';
import { EXPORT_FILES, exportRowCount, renderExport, type ExportFormat } from '../export/formats.js';
import { normalizeLead } from '../pipeline/normalize.js';
import { BuyBoxInput, defaultBuyBox, updateBuyBox } from '../score/index.js';
import { CsvImportError, parseCsv } from '../sources/csv.js';
import { isStateCode } from '../sources/states.js';
import { getTrade, TRADE_KEYS } from '../sources/trades.js';
import type { RawLead } from '../types.js';
import type { JobRunner } from '../runs/job.js';
import { discoverLoader, type SourceDeps } from '../runs/loaders.js';
import { filterLeads, LeadQuery, tierCounts, toApiLead } from '../runs/present.js';
import { rescoreRun } from '../runs/rescore.js';
import { emptyStats, type RunRecord } from '../runs/types.js';

export interface RunsDeps {
  repo: Repo;
  runner: JobRunner;
  sources: SourceDeps;
  limits: { maxCsvRows: number; recommendedRows: number };
  now?: () => Date;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const DiscoverBody = z.object({
  trade: z.string().refine((t) => Boolean(getTrade(t)), { message: `trade must be one of: ${TRADE_KEYS.join(', ')}` }),
  state: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine(isStateCode, { message: 'state must be a US state code, e.g. TX' }),
});

const ExportQuery = z.object({ format: z.enum(['csv', 'callsheet', 'hubspot']).default('csv') });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    throw new HttpError(400, 'BAD_REQUEST', msg);
  }
  return r.data;
}

const statesIn = (leads: RawLead[]) => [...new Set(leads.map((l) => normalizeLead(l).state).filter((s): s is string => Boolean(s)))];

/** API view of a run. */
function toApiRun(run: RunRecord) {
  const { progress, notice, ...stats } = run.stats;
  return {
    id: run.id,
    sourceType: run.sourceType,
    params: run.params,
    status: run.status,
    createdAt: run.createdAt,
    progress,
    stats,
    buybox: run.buybox,
    notice,
    error: run.error,
  };
}

export function runsRouter(deps: RunsDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());

  const loadRun = async (req: Request) => {
    const run = await deps.repo.getRun(String(req.params.id));
    if (!run) throw new HttpError(404, 'NOT_FOUND', 'Run not found');
    return run;
  };

  router.post('/runs/discover', async (req, res) => {
    const { trade, state } = parse(DiscoverBody, req.body ?? {});
    const t = getTrade(trade)!;
    const run = await deps.repo.createRun({ sourceType: 'osm', params: { trade, state }, buybox: defaultBuyBox([state]), stats: emptyStats() });
    void deps.runner.start(run, discoverLoader(deps.sources, t, state));
    res.status(202).json({ runId: run.id, status: run.status, sourceType: run.sourceType });
  });

  router.post('/runs/import', upload.single('file'), async (req, res) => {
    const sample = String(req.body?.sample ?? '') === 'true';
    let leads: RawLead[];
    let warnings: string[];
    let fileName: string;
    try {
      if (sample) {
        const parsed = parseCsv(await deps.sources.sampleCsv(), deps.limits);
        leads = [...parsed.leads, ...deps.sources.seed()];
        warnings = [];
        fileName = 'sample-synthetic.csv + seed list';
      } else {
        if (!req.file) throw new HttpError(400, 'NO_FILE', 'Attach a CSV file as "file", or send sample=true.');
        const parsed = parseCsv(req.file.buffer.toString('utf8'), deps.limits);
        leads = parsed.leads;
        warnings = parsed.warnings;
        fileName = req.file.originalname;
      }
    } catch (err) {
      if (err instanceof CsvImportError) throw new HttpError(422, err.code, err.message);
      throw err;
    }
    const sourceType = sample ? 'sample' : 'csv';
    const run = await deps.repo.createRun({
      sourceType,
      params: { fileName, rows: leads.length },
      buybox: defaultBuyBox(statesIn(leads)),
      stats: emptyStats(),
    });
    void deps.runner.start(run, async () => ({ leads, warnings }));
    res.status(202).json({ runId: run.id, status: run.status, sourceType, rows: leads.length, warnings });
  });

  router.get('/runs/:id', async (req, res) => {
    res.json(toApiRun(await loadRun(req)));
  });

  router.get('/runs/:id/leads', async (req, res) => {
    const run = await loadRun(req);
    const q = parse(LeadQuery, req.query);
    const all = await deps.repo.listLeads(run.id);
    const items = filterLeads(all, q);
    res.json({ total: all.length, filtered: items.length, counts: tierCounts(all), items: items.map((l) => toApiLead(l, now())) });
  });

  router.put('/runs/:id/buybox', async (req, res) => {
    const run = await loadRun(req);
    if (run.status === 'queued' || run.status === 'running') {
      throw new HttpError(409, 'RUN_IN_PROGRESS', 'Wait for the run to finish before changing the buy-box.');
    }
    const buybox = updateBuyBox(run.buybox, parse(BuyBoxInput, req.body ?? {}));
    const result = await rescoreRun(deps.repo, run, buybox, now());
    res.json({ runId: run.id, ...result, buybox });
  });

  router.post('/runs/:id/cancel', async (req, res) => {
    const run = await loadRun(req);
    if (run.status !== 'queued' && run.status !== 'running') {
      throw new HttpError(409, 'NOT_RUNNING', `Run is already ${run.status}.`);
    }
    if (!deps.runner.cancel(run.id)) await deps.repo.updateRun(run.id, { status: 'cancelled' });
    res.json({ runId: run.id, status: 'cancelled' });
  });

  router.get('/runs/:id/export', async (req: Request, res: Response) => {
    const run = await loadRun(req);
    const { format } = parse(ExportQuery, { format: req.query.format });
    const leads = filterLeads(await deps.repo.listLeads(run.id), parse(LeadQuery, req.query));
    const body = renderExport(format as ExportFormat, leads, now());
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${EXPORT_FILES[format as ExportFormat]}"`)
      .set('X-Row-Count', String(exportRowCount(format as ExportFormat, leads)))
      .send(body);
  });

  return router;
}
