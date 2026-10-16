import { SOURCE_LABELS } from '../sources/types.js';
import type { LeadField, MergedFromEntry, MergedLead, NormalizedLead, SourceName } from '../types.js';

type MatchKind = MergedFromEntry['matchedOn'][number];

const MERGE_FIELDS: LeadField[] = [
  'company', 'domain', 'website', 'phone', 'email', 'street', 'city', 'state', 'industry', 'yearFounded', 'ownerName',
];

export interface DedupeStats {
  rowsIn: number;
  rowsInBySource: Partial<Record<SourceName, number>>;
  unique: number;
  duplicatesMerged: number;
  /** Merged groups whose rows came from more than one source. */
  crossSourceGroups: number;
}

export interface DedupeResult {
  leads: MergedLead[];
  stats: DedupeStats;
}

function matchKeys(lead: NormalizedLead): Array<[MatchKind, string]> {
  const keys: Array<[MatchKind, string]> = [];
  if (lead.domain) keys.push(['domain', `d:${lead.domain}`]);
  if (lead.phone) keys.push(['phone', `p:${lead.phone}`]);
  if (lead.nameKey && lead.city) keys.push(['name+city', `nc:${lead.nameKey}|${lead.city.toLowerCase()}`]);
  return keys;
}

function filledCount(lead: NormalizedLead): number {
  return MERGE_FIELDS.filter((f) => lead[f] !== null).length;
}

/**
 * Duplicate if same domain OR same phone OR same name + city (transitively).
 * Each group keeps its most complete row, fills that row's gaps from the others,
 * and records where every value came from.
 */
export function dedupe(input: NormalizedLead[]): DedupeResult {
  const parent = input.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const owner = new Map<string, number>();
  input.forEach((lead, i) => {
    for (const [, key] of matchKeys(lead)) {
      const seen = owner.get(key);
      if (seen === undefined) owner.set(key, i);
      else union(i, seen);
    }
  });

  const groups = new Map<number, number[]>();
  input.forEach((_, i) => {
    const root = find(i);
    const members = groups.get(root);
    if (members) members.push(i);
    else groups.set(root, [i]);
  });

  const leads: MergedLead[] = [];
  let crossSourceGroups = 0;
  for (const members of groups.values()) {
    // Most complete first; ties keep input order.
    const ordered = [...members].sort((a, b) => filledCount(input[b]!) - filledCount(input[a]!) || a - b);
    const base = input[ordered[0]!]!;
    const merged: MergedLead = {
      company: null, domain: null, website: null, phone: null, email: null, street: null, city: null,
      state: null, industry: null, yearFounded: null, ownerName: null,
      source: '', sources: [], raw: [], fieldSources: {}, mergedFrom: [],
    };

    for (const idx of ordered) {
      const row = input[idx]!;
      for (const f of MERGE_FIELDS) {
        if (merged[f] === null && row[f] !== null) {
          (merged as unknown as Record<LeadField, unknown>)[f] = row[f];
          merged.fieldSources[f] = { source: SOURCE_LABELS[row.source] };
        }
      }
      if (!merged.sources.includes(row.source)) merged.sources.push(row.source);
      merged.raw.push({ source: row.source, record: row.raw });
      if (row !== base) {
        // Keys this row shares with any other row in its group.
        const others = new Set(ordered.filter((j) => j !== idx).flatMap((j) => matchKeys(input[j]!).map(([, k]) => k)));
        const matchedOn = [...new Set(matchKeys(row).filter(([, k]) => others.has(k)).map(([kind]) => kind))];
        merged.mergedFrom.push({ source: row.source, company: row.company, domain: row.domain, phone: row.phone, matchedOn });
      }
    }
    merged.sources.sort();
    merged.source = merged.sources.join('+');
    if (merged.sources.length > 1) crossSourceGroups++;
    leads.push(merged);
  }

  const rowsInBySource: Partial<Record<SourceName, number>> = {};
  for (const l of input) rowsInBySource[l.source] = (rowsInBySource[l.source] ?? 0) + 1;

  return {
    leads,
    stats: {
      rowsIn: input.length,
      rowsInBySource,
      unique: leads.length,
      duplicatesMerged: input.length - leads.length,
      crossSourceGroups,
    },
  };
}
