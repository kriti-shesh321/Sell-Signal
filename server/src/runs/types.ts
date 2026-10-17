import type { SiteSignals } from '../enrich/extract/index.js';
import type { SiteState } from '../pipeline/applyFacts.js';
import type { BuyBox, Reason, Tier } from '../score/index.js';
import type { FieldSource, Industry, LeadField, MergedFromEntry, OwnerRole, SourceName } from '../types.js';
import type { Validation } from '../validate/validate.js';

export type RunSourceType = 'osm' | 'csv' | 'seed' | 'sample';
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type Stage = 'queued' | 'reading' | 'merging' | 'enriching' | 'scoring' | 'done';

export interface RunStats {
  progress: { stage: Stage; processed: number; total: number; pct: number };
  rowsIn: Partial<Record<SourceName, number>>;
  duplicatesMerged: number;
  unique: number;
  crossSourceDuplicates: number;
  completeness: { before: number; after: number };
  fieldsFilled: number;
  sites: { ok: number; blocked: number; unreachable: number; robotsDisallowed: number; noWebsite: number; cached: number };
  tiers: Record<Tier, number>;
  topSignals: Array<{ key: string; label: string; count: number }>;
  /** % of unique leads that have the field after enrichment */
  fillRates: { phone: number; email: number; yearFounded: number; ownerName: number };
  ai: { enabled: boolean; calls: number };
  timings: { startedAt: string | null; finishedAt: string | null; elapsedMs: number; avgSiteMs: number };
  notice: string | null;
  warnings: string[];
}

export interface RunRecord {
  id: string;
  sourceType: RunSourceType;
  params: Record<string, unknown>;
  status: RunStatus;
  stats: RunStats;
  buybox: BuyBox;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadRecord {
  id: string;
  runId: string;
  source: string;
  raw: unknown;
  company: string | null;
  domain: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  industry: Industry | null;
  yearFounded: number | null;
  ownerName: string | null;
  ownerRole: OwnerRole | null;
  signals: SiteSignals | null;
  fieldSources: Partial<Record<LeadField, FieldSource>>;
  validation: Validation | null;
  completenessBefore: number | null;
  completenessAfter: number | null;
  score: number | null;
  tier: Tier | null;
  reasons: Reason[];
  whyCall: string | null;
  mergedFrom: MergedFromEntry[];
  filled: LeadField[];
}

export type NewLead = Omit<LeadRecord, 'id'>;

export function emptyStats(): RunStats {
  return {
    progress: { stage: 'queued', processed: 0, total: 0, pct: 0 },
    rowsIn: {},
    duplicatesMerged: 0,
    unique: 0,
    crossSourceDuplicates: 0,
    completeness: { before: 0, after: 0 },
    fieldsFilled: 0,
    sites: { ok: 0, blocked: 0, unreachable: 0, robotsDisallowed: 0, noWebsite: 0, cached: 0 },
    tiers: { A: 0, B: 0, C: 0 },
    topSignals: [],
    fillRates: { phone: 0, email: 0, yearFounded: 0, ownerName: 0 },
    ai: { enabled: false, calls: 0 },
    timings: { startedAt: null, finishedAt: null, elapsedMs: 0, avgSiteMs: 0 },
    notice: null,
    warnings: [],
  };
}

export const siteStateOf = (lead: Pick<LeadRecord, 'validation' | 'domain'>): SiteState =>
  lead.validation?.siteStatus ?? (lead.domain ? 'unreachable' : 'no_website');
