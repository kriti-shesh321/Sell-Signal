import pg from 'pg';

export type Db = {
  query: pg.Pool['query'];
  ping(): Promise<void>;
  close(): Promise<void>;
};

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return {
    query: pool.query.bind(pool) as pg.Pool['query'],
    async ping() {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}
