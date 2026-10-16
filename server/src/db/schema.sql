-- Idempotent schema; applied on server boot and by `npm run db:migrate`.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type  text NOT NULL CHECK (source_type IN ('osm','csv','seed','sample')),
  params       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','failed','cancelled')),
  stats        jsonb NOT NULL DEFAULT '{}'::jsonb,
  buybox       jsonb NOT NULL,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source               text NOT NULL,
  raw                  jsonb NOT NULL,
  company              text,
  domain               text,
  website              text,
  phone                text,
  email                text,
  street               text,
  city                 text,
  state                text,
  industry             text,
  year_founded         int CHECK (year_founded IS NULL OR year_founded >= 1900),
  owner_name           text,
  signals              jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_sources        jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation           jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness_before  int,
  completeness_after   int,
  score                int,
  tier                 text CHECK (tier IS NULL OR tier IN ('A','B','C')),
  reasons              jsonb NOT NULL DEFAULT '[]'::jsonb,
  why_call             text,
  merged_from          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_run_score_idx ON leads (run_id, score DESC);

-- The cache: one row per website. The 7-day TTL is enforced in code via fetched_at.
CREATE TABLE IF NOT EXISTS domain_cache (
  domain      text PRIMARY KEY,
  data        jsonb NOT NULL,
  status      text NOT NULL CHECK (status IN ('ok','blocked','unreachable','robots_disallowed')),
  fetched_at  timestamptz NOT NULL DEFAULT now()
);
