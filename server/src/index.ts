import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createDb } from './db/pool.js';
import { configureNetwork } from './net.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment (e.g. the host’s environment variables)
}

configureNetwork();
const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db);
console.log('migrations applied');

const app = createApp({
  db,
  corsOrigins: config.corsOrigins,
  version: process.env.npm_package_version ?? '0.1.0',
  aiFallback: config.AI_FALLBACK,
});

const server = app.listen(config.PORT, () => {
  console.log(`SellSignal API listening on :${config.PORT}`);
});

const shutdown = () => {
  server.close(() => void db.close().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
