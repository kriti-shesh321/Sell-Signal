import { describe, expect, it } from 'vitest';
import { migrateWithRetry } from '../../src/db/migrate.js';

describe('migrateWithRetry', () => {
  it('retries while the database wakes up, then succeeds', async () => {
    let calls = 0;
    const db = {
      query: (async () => {
        calls++;
        if (calls < 3) throw new Error('Connection terminated due to connection timeout');
        return { rows: [] };
      }) as never,
    };
    const logs: string[] = [];
    await migrateWithRetry(db, { delayMs: 1, log: (m) => logs.push(m) });
    expect(calls).toBe(3);
    expect(logs).toHaveLength(2);
  });

  it('gives up after the last attempt', async () => {
    const db = { query: (async () => { throw new Error('down'); }) as never };
    await expect(migrateWithRetry(db, { attempts: 2, delayMs: 1 })).rejects.toThrow('down');
  });
});
