import pLimit from 'p-limit';
import type { SiteStatus } from '../enrich/cache.js';
import type { SiteFacts } from '../enrich/extract/index.js';
import { applySiteFacts } from '../pipeline/applyFacts.js';
import { completeness } from '../pipeline/completeness.js';
import { dedupe } from '../pipeline/dedupe.js';
import { normalizeLead } from '../pipeline/normalize.js';
import { scoreEnriched } from '../score/index.js';
import type { MergedLead, RawLead } from '../types.js';
import { validateLead, type MxLookup } from '../validate/validate.js';
import type { Repo } from '../db/repo.js';
import { leadReport } from './report.js';
import type { LeadRecord, NewLead, RunRecord, RunSourceType, RunStats, Stage } from './types.js';

export interface SiteResult {
  status: SiteStatus;
  facts: SiteFacts | null;
  cached: boolean;
  ms: number;
}

export interface LoadResult {
  leads: RawLead[];
  /** e.g. discovery fell back to the seed list */
  sourceType?: RunSourceType;
  notice?: string;
  warnings?: string[];
}

export interface JobDeps {
  repo: Repo;
  crawl: (domain: string) => Promise<SiteResult>;
  /** A fresh, memoized MX lookup per run. */
  mx: () => MxLookup;
  concurrency: number;
  now?: () => Date;
  /** Minimum gap between progress writes to runs.stats. */
  statsIntervalMs?: number;
  log?: (msg: string) => void;
}

const SITE_COUNTER: Record<SiteStatus, keyof RunStats['sites']> = {
  ok: 'ok',
  blocked: 'blocked',
  unreachable: 'unreachable',
  robots_disallowed: 'robotsDisallowed',
};

function newLeadFrom(m: MergedLead, runId: string): NewLead {
  return {
    runId,
    source: m.source,
    raw: m.raw,
    company: m.company,
    domain: m.domain,
    website: m.website,
    phone: m.phone,
    email: m.email,
    street: m.street,
    city: m.city,
    state: m.state,
    industry: m.industry,
    yearFounded: m.yearFounded,
    ownerName: m.ownerName,
    ownerRole: m.ownerRole,
    signals: null,
    fieldSources: m.fieldSources,
    validation: null,
    completenessBefore: completeness(m),
    completenessAfter: null,
    score: null,
    tier: null,
    reasons: [],
    whyCall: null,
    mergedFrom: m.mergedFrom,
    filled: [],
  };
}

/**
 * In-process background jobs: one run = load → normalize + dedupe → enrich each company
 * (p-limit) → validate → score, with progress written to runs.stats for the client to poll.
 */
export class JobRunner {
  private readonly active = new Map<string, { cancelled: boolean; done: Promise<void> }>();

  constructor(private readonly deps: JobDeps) {}

  start(run: RunRecord, load: () => Promise<LoadResult>): Promise<void> {
    const entry = { cancelled: false, done: Promise.resolve() };
    entry.done = this.execute(run, load, entry).finally(() => this.active.delete(run.id));
    this.active.set(run.id, entry);
    return entry.done;
  }

  /** Ask a running job to stop after the companies in flight. */
  cancel(runId: string): boolean {
    const job = this.active.get(runId);
    if (job) job.cancelled = true;
    return Boolean(job);
  }

  isActive(runId: string) {
    return this.active.has(runId);
  }

  /** Resolves when the run's job finishes (tests, graceful shutdown). */
  wait(runId: string): Promise<void> {
    return this.active.get(runId)?.done ?? Promise.resolve();
  }

  private async execute(run: RunRecord, load: () => Promise<LoadResult>, job: { cancelled: boolean }): Promise<void> {
    const { repo } = this.deps;
    const now = this.deps.now ?? (() => new Date());
    const started = Date.now();
    const stats: RunStats = { ...run.stats, timings: { ...run.stats.timings, startedAt: new Date(started).toISOString() } };
    let lastWrite = 0;
    const setStage = (stage: Stage) => {
      stats.progress.stage = stage;
    };
    const flush = async (force = false) => {
      stats.timings.elapsedMs = Date.now() - started;
      if (!force && Date.now() - lastWrite < (this.deps.statsIntervalMs ?? 1000)) return;
      lastWrite = Date.now();
      await repo.updateRun(run.id, { stats });
    };

    try {
      setStage('reading');
      await repo.updateRun(run.id, { status: 'running', stats });
      const loaded = await load();
      if (loaded.notice) stats.notice = loaded.notice;
      if (loaded.warnings) stats.warnings = [...stats.warnings, ...loaded.warnings];
      if (loaded.sourceType && loaded.sourceType !== run.sourceType) await repo.updateRun(run.id, { sourceType: loaded.sourceType });

      setStage('merging');
      await flush(true);
      const { leads: merged, stats: d } = dedupe(loaded.leads.map((l) => normalizeLead(l, now())));
      Object.assign(stats, {
        rowsIn: d.rowsInBySource,
        duplicatesMerged: d.duplicatesMerged,
        unique: d.unique,
        crossSourceDuplicates: d.crossSourceGroups,
      });
      const records = await repo.insertLeads(run.id, merged.map((m) => newLeadFrom(m, run.id)));
      stats.completeness = { before: leadReport(records).completeness.before, after: 0 };
      stats.progress = { stage: 'enriching', processed: 0, total: records.length, pct: records.length ? 0 : 100 };
      await flush(true);

      const mx = this.deps.mx();
      const limit = pLimit(this.deps.concurrency);
      let crawlMs = 0;
      let crawled = 0;
      await Promise.all(
        records.map((record, i) =>
          limit(async () => {
            if (job.cancelled) return;
            const m = merged[i]!;
            let site: SiteResult | null = null;
            if (m.domain) {
              try {
                site = await this.deps.crawl(m.domain);
              } catch (err) {
                this.deps.log?.(`crawl ${m.domain} failed: ${err instanceof Error ? err.message : String(err)}`);
                site = { status: 'unreachable', facts: null, cached: false, ms: 0 };
              }
              stats.sites[SITE_COUNTER[site.status]]++;
              if (site.cached) stats.sites.cached++;
              else {
                crawlMs += site.ms;
                crawled++;
              }
            } else {
              stats.sites.noWebsite++;
            }
            const enriched = applySiteFacts(m, site);
            const validation = await validateLead(enriched, mx);
            const scored = scoreEnriched(enriched, validation, run.buybox, now());
            const patch = {
              phone: enriched.phone,
              email: enriched.email,
              street: enriched.street,
              city: enriched.city,
              state: enriched.state,
              yearFounded: enriched.yearFounded,
              ownerName: enriched.ownerName,
              ownerRole: enriched.ownerRole,
              signals: enriched.signals,
              fieldSources: enriched.fieldSources,
              filled: enriched.filled,
              validation,
              completenessAfter: completeness(enriched),
              score: scored.score,
              tier: scored.tier,
              reasons: scored.reasons,
              whyCall: scored.whyCall,
            };
            await repo.updateLead(record.id, patch);
            Object.assign(record, patch);
            stats.progress.processed++;
            stats.progress.pct = Math.round((stats.progress.processed / stats.progress.total) * 100);
            stats.fieldsFilled += enriched.filled.length;
            stats.timings.avgSiteMs = crawled ? Math.round(crawlMs / crawled) : 0;
            Object.assign(stats, { tiers: leadReport(records.filter((r) => r.tier)).tiers });
            await flush();
          }),
        ),
      );

      setStage(job.cancelled ? stats.progress.stage : 'scoring');
      const report = leadReport(records as LeadRecord[]);
      Object.assign(stats, report);
      stats.timings.finishedAt = new Date().toISOString();
      if (job.cancelled) {
        await flush(true);
        await repo.updateRun(run.id, { status: 'cancelled' });
        return;
      }
      setStage('done');
      stats.progress.pct = 100;
      await flush(true);
      await repo.updateRun(run.id, { status: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log?.(`run ${run.id} failed: ${message}`);
      stats.timings.finishedAt = new Date().toISOString();
      await repo.updateRun(run.id, { status: 'failed', error: message, stats }).catch(() => {});
    }
  }
}
