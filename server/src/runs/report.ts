import type { ReasonKey } from '../score/index.js';
import type { LeadRecord, RunStats } from './types.js';

const SIGNAL_LABELS: Record<ReasonKey, string> = {
  age20: 'In business 20+ years',
  age10: 'In business 10–19 years',
  familyOwned: 'Family-owned / owner-operated',
  industry: 'Industry in buy-box',
  owner: 'Owner or founder named',
  phone: 'Valid phone',
  emailDomain: 'Domain accepts email',
  underDigitized: 'Dated website',
  state: 'State in buy-box',
  franchise: 'Franchise / subsidiary / PE-owned',
  nonprofit: 'Nonprofit / public',
  siteIssue: 'Website blocked or unreachable',
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** The data-quality report fields that depend only on the leads (tiers, fill, signals). */
export function leadReport(leads: LeadRecord[]): Pick<RunStats, 'tiers' | 'topSignals' | 'fillRates' | 'fieldsFilled' | 'completeness'> {
  const tiers = { A: 0, B: 0, C: 0 };
  const signalCounts = new Map<ReasonKey, number>();
  for (const l of leads) {
    if (l.tier) tiers[l.tier]++;
    for (const r of l.reasons) signalCounts.set(r.key, (signalCounts.get(r.key) ?? 0) + 1);
  }
  const before = leads.filter((l) => l.completenessBefore !== null).map((l) => l.completenessBefore!);
  const after = leads.filter((l) => l.completenessAfter !== null).map((l) => l.completenessAfter!);
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const has = (f: (l: LeadRecord) => unknown) => pct(leads.filter(f).length, leads.length);
  return {
    tiers,
    topSignals: [...signalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => ({ key, label: SIGNAL_LABELS[key], count })),
    fillRates: {
      phone: has((l) => l.phone),
      email: has((l) => l.email),
      yearFounded: has((l) => l.yearFounded),
      ownerName: has((l) => l.ownerName),
    },
    fieldsFilled: leads.reduce((n, l) => n + l.filled.length, 0),
    completeness: { before: mean(before), after: after.length ? mean(after) : mean(before) },
  };
}
