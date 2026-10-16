import { describe, expect, it } from 'vitest';
import { memoryDomainCache } from '../../src/enrich/cache.js';

const TTL = { days: 7, unreachableDays: 1 };
const clock = (start: string) => {
  let now = new Date(start);
  return { now: () => now, set: (iso: string) => void (now = new Date(iso)) };
};

describe('memoryDomainCache', () => {
  it('returns a fresh entry', async () => {
    const c = clock('2026-01-01T00:00:00Z');
    const cache = memoryDomainCache(TTL, c.now);
    await cache.put('smith.com', { pages: 3 }, 'ok');
    c.set('2026-01-07T23:00:00Z');
    expect(await cache.get('smith.com')).toMatchObject({ status: 'ok', data: { pages: 3 } });
  });

  it.each(['ok', 'blocked', 'robots_disallowed'] as const)('keeps %s for 7 days, not 8', async (status) => {
    const c = clock('2026-01-01T00:00:00Z');
    const cache = memoryDomainCache(TTL, c.now);
    await cache.put('smith.com', {}, status);
    c.set('2026-01-07T12:00:00Z');
    expect(await cache.get('smith.com')).not.toBeNull();
    c.set('2026-01-09T00:00:00Z');
    expect(await cache.get('smith.com')).toBeNull();
  });

  it('keeps unreachable for only 1 day', async () => {
    const c = clock('2026-01-01T00:00:00Z');
    const cache = memoryDomainCache(TTL, c.now);
    await cache.put('down.com', {}, 'unreachable');
    c.set('2026-01-01T20:00:00Z');
    expect(await cache.get('down.com')).not.toBeNull();
    c.set('2026-01-02T01:00:00Z');
    expect(await cache.get('down.com')).toBeNull();
  });

  it('overwrites on put', async () => {
    const cache = memoryDomainCache(TTL);
    await cache.put('smith.com', { v: 1 }, 'unreachable');
    await cache.put('smith.com', { v: 2 }, 'ok');
    expect(await cache.get('smith.com')).toMatchObject({ status: 'ok', data: { v: 2 } });
  });
});
