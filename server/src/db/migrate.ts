import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

export async function migrate(db: Db): Promise<void> {
  const sql = await readFile(schemaPath, 'utf8');
  await db.query(sql);
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
