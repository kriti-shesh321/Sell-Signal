import { z } from 'zod';

const onOff = z.enum(['on', 'off']).default('off');

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see server/.env.example)'),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  OVERPASS_URL: z.url().default('https://overpass-api.de/api/interpreter'),
  OVERPASS_MIRROR_URL: z.url().default('https://overpass.kumi.systems/api/interpreter'),
  MAX_DISCOVER: z.coerce.number().int().positive().max(200).default(40),
  USER_AGENT: z.string().default('SellSignal/0.1 (+https://github.com/kriti-shesh321/Sell-Signal)'),
  FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  CRAWL_CONCURRENCY: z.coerce.number().int().positive().max(10).default(5),
  CACHE_TTL_DAYS: z.coerce.number().positive().default(7),
  CACHE_TTL_UNREACHABLE_DAYS: z.coerce.number().positive().default(1),
  AI_FALLBACK: onOff,
  AI_MODEL: z.string().optional(),
  AI_MAX_CALLS_PER_RUN: z.coerce.number().int().nonnegative().default(25),
  AI_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(15),
  GEMINI_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema> & { corsOrigins: string[] };

/** Parse env vars; blank values count as unset. Throws one readable error listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server configuration:\n${problems.join('\n')}`);
  }
  const corsOrigins = parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  return { ...parsed.data, corsOrigins };
}
