import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

export async function migrate(db: Pick<Db, 'query'>): Promise<void> {
  const sql = await readFile(schemaPath, 'utf8');
  await db.query(sql);
}

/**
 * Migrate on boot, retrying with backoff: a serverless database (e.g. Neon) that has scaled to zero
 * can take several seconds to wake, and the first connection may time out.
 */
export async function migrateWithRetry(
  db: Pick<Db, 'query'>,
  opts: { attempts?: number; delayMs?: number; log?: (msg: string) => void } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 4;
  for (let i = 1; ; i++) {
    try {
      return await migrate(db);
    } catch (err) {
      if (i >= attempts) throw err;
      const wait = (opts.delayMs ?? 2000) * i;
      opts.log?.(`database not ready (${err instanceof Error ? err.message : String(err)}); retrying in ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// `npm run db:migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('./pool.js');
  const { configureNetwork } = await import('../net.js');
  configureNetwork();
  try {
    process.loadEnvFile();
  } catch {
    // no .env file: rely on the real environment
  }
  const db = createDb(loadConfig().DATABASE_URL);
  try {
    await migrate(db);
    console.log('migrations applied');
  } finally {
    await db.close();
  }
}
