import type { Db } from '../db/pool.js';

export type SiteStatus = 'ok' | 'blocked' | 'unreachable' | 'robots_disallowed';

export interface CacheEntry<T = unknown> {
  domain: string;
  data: T;
  status: SiteStatus;
  fetchedAt: Date;
}

/** The "notebook" of sites already visited: one row per domain, reused while younger than the TTL. */
export interface DomainCache {
  get<T>(domain: string): Promise<CacheEntry<T> | null>;
  put(domain: string, data: unknown, status: SiteStatus): Promise<void>;
}

export interface CacheTtl {
  /** ok, blocked, robots_disallowed */
  days: number;
  /** unreachable sites are often only briefly down, so they're retried sooner */
  unreachableDays: number;
}

export const ttlDaysFor = (status: SiteStatus, ttl: CacheTtl) => (status === 'unreachable' ? ttl.unreachableDays : ttl.days);

export function pgDomainCache(db: Pick<Db, 'query'>, ttl: CacheTtl): DomainCache {
  return {
    async get<T>(domain: string) {
      const { rows } = await db.query<{ domain: string; data: T; status: SiteStatus; fetched_at: Date }>(
        `SELECT domain, data, status, fetched_at FROM domain_cache
          WHERE domain = $1
            AND fetched_at > now() - (CASE WHEN status = 'unreachable' THEN $3::float8 ELSE $2::float8 END) * interval '1 day'`,
        [domain, ttl.days, ttl.unreachableDays],
      );
      const row = rows[0];
      return row ? { domain: row.domain, data: row.data, status: row.status, fetchedAt: row.fetched_at } : null;
    },
    async put(domain, data, status) {
      await db.query(
        `INSERT INTO domain_cache (domain, data, status, fetched_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (domain) DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status, fetched_at = now()`,
        [domain, JSON.stringify(data), status],
      );
    },
  };
}

/** In-memory cache with the same TTL rule, for tests and offline tools. */
export function memoryDomainCache(ttl: CacheTtl, now: () => Date = () => new Date()): DomainCache & {
  entries: Map<string, CacheEntry>;
} {
  const entries = new Map<string, CacheEntry>();
  return {
    entries,
    async get<T>(domain: string) {
      const e = entries.get(domain);
      if (!e) return null;
      const ageDays = (now().getTime() - e.fetchedAt.getTime()) / 86_400_000;
      return ageDays < ttlDaysFor(e.status, ttl) ? (e as CacheEntry<T>) : null;
    },
    async put(domain, data, status) {
      entries.set(domain, { domain, data: structuredClone(data), status, fetchedAt: now() });
    },
  };
}
