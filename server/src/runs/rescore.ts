import type { Repo } from '../db/repo.js';
import { scoreEnriched, type BuyBox } from '../score/index.js';
import { leadReport } from './report.js';
import { siteStateOf, type RunRecord } from './types.js';

/** Re-score every processed lead of a run from its stored signals and validation. No refetching. */
export async function rescoreRun(repo: Repo, run: RunRecord, buybox: BuyBox, now: Date = new Date()) {
  const leads = await repo.listLeads(run.id);
  let rescored = 0;
  await Promise.all(
    leads.map(async (l) => {
      if (!l.validation) return; // never processed (cancelled run)
      const r = scoreEnriched({ ...l, siteStatus: siteStateOf(l) }, l.validation, buybox, now);
      Object.assign(l, { score: r.score, tier: r.tier, reasons: r.reasons, whyCall: r.whyCall });
      await repo.updateLead(l.id, { score: r.score, tier: r.tier, reasons: r.reasons, whyCall: r.whyCall });
      rescored++;
    }),
  );
  const report = leadReport(leads);
  await repo.updateRun(run.id, { buybox, stats: { ...run.stats, tiers: report.tiers, topSignals: report.topSignals } });
  return { rescored, tiers: report.tiers };
}
