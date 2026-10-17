import pg from 'pg';
import { configureNetwork } from '../net.js';

export type Db = {
  query: pg.Pool['query'];
  ping(): Promise<void>;
  close(): Promise<void>;
};

export function createDb(connectionString: string): Db {
  configureNetwork(); // distant databases need more than Node's default 250 ms per address
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 10_000 });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return {
    query: pool.query.bind(pool) as pg.Pool['query'],
    async ping() {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}
