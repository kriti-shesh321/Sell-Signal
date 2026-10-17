import type { BuyBox } from '../score/index.js';
import type { LeadRecord, NewLead, RunRecord, RunSourceType, RunStats, RunStatus } from '../runs/types.js';
import type { Db } from './pool.js';

export interface RunPatch {
  status?: RunStatus;
  stats?: RunStats;
  buybox?: BuyBox;
  error?: string | null;
  sourceType?: RunSourceType;
}

export type LeadPatch = Partial<Omit<LeadRecord, 'id' | 'runId'>>;

/** New score for one lead after a buy-box change. */
export type ScoreUpdate = Pick<LeadRecord, 'id' | 'score' | 'tier' | 'reasons' | 'whyCall'>;

/** Storage for runs and leads. Postgres in production, in-memory in tests. */
export interface Repo {
  createRun(input: { sourceType: RunSourceType; params: Record<string, unknown>; buybox: BuyBox; stats: RunStats }): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  updateRun(id: string, patch: RunPatch): Promise<void>;
  insertLeads(runId: string, leads: NewLead[]): Promise<LeadRecord[]>;
  updateLead(id: string, patch: LeadPatch): Promise<void>;
  /** Write many leads' scores in one round trip (rescoring). */
  updateScores(updates: ScoreUpdate[]): Promise<void>;
  listLeads(runId: string): Promise<LeadRecord[]>;
  /** Runs left queued/running by a crash or restart are marked failed. Returns how many. */
  failOrphanedRuns(message: string): Promise<number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID.test(id);

// camelCase field → column, and whether it's stored as jsonb.
const LEAD_COLUMNS: Array<[keyof NewLead, string, boolean]> = [
  ['runId', 'run_id', false],
  ['source', 'source', false],
  ['raw', 'raw', true],
  ['company', 'company', false],
  ['domain', 'domain', false],
  ['website', 'website', false],
  ['phone', 'phone', false],
  ['email', 'email', false],
  ['street', 'street', false],
  ['city', 'city', false],
  ['state', 'state', false],
  ['industry', 'industry', false],
  ['yearFounded', 'year_founded', false],
  ['ownerName', 'owner_name', false],
  ['ownerRole', 'owner_role', false],
  ['signals', 'signals', true],
  ['fieldSources', 'field_sources', true],
  ['validation', 'validation', true],
  ['completenessBefore', 'completeness_before', false],
  ['completenessAfter', 'completeness_after', false],
  ['score', 'score', false],
  ['tier', 'tier', false],
  ['reasons', 'reasons', true],
  ['whyCall', 'why_call', false],
  ['mergedFrom', 'merged_from', true],
  ['filled', 'filled', true],
];
const COLUMN_OF = new Map(LEAD_COLUMNS.map(([k, c, j]) => [k, [c, j] as const]));

// jsonb columns that are NOT NULL in the schema store their empty value instead of null.
const JSON_EMPTY: Partial<Record<keyof NewLead, string>> = { signals: '{}', fieldSources: '{}', validation: '{}', reasons: '[]', mergedFrom: '[]', filled: '[]' };
const toParam = (key: keyof NewLead, value: unknown, json: boolean) =>
  json ? (value === null || value === undefined ? (JSON_EMPTY[key] ?? null) : JSON.stringify(value)) : (value ?? null);

type Row = Record<string, unknown>;

function rowToLead(r: Row): LeadRecord {
  const lead = { id: r.id } as Record<string, unknown>;
  for (const [key, col] of LEAD_COLUMNS) lead[key] = r[col] ?? null;
  // empty jsonb objects stand for "not known"
  if (lead.signals && Object.keys(lead.signals as object).length === 0) lead.signals = null;
  if (lead.validation && Object.keys(lead.validation as object).length === 0) lead.validation = null;
  return lead as unknown as LeadRecord;
}

function rowToRun(r: Row): RunRecord {
  return {
    id: r.id as string,
    sourceType: r.source_type as RunSourceType,
    params: r.params as Record<string, unknown>,
    status: r.status as RunStatus,
    stats: r.stats as RunStats,
    buybox: r.buybox as BuyBox,
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

export function pgRepo(db: Pick<Db, 'query'>): Repo {
  return {
    async createRun({ sourceType, params, buybox, stats }) {
      const { rows } = await db.query<Row>(
        `INSERT INTO runs (source_type, params, buybox, stats) VALUES ($1, $2, $3, $4) RETURNING *`,
        [sourceType, JSON.stringify(params), JSON.stringify(buybox), JSON.stringify(stats)],
      );
      return rowToRun(rows[0]!);
    },
    async getRun(id) {
      if (!isUuid(id)) return null;
      const { rows } = await db.query<Row>(`SELECT * FROM runs WHERE id = $1`, [id]);
      return rows[0] ? rowToRun(rows[0]) : null;
    },
    async updateRun(id, patch) {
      const sets: string[] = [];
      const values: unknown[] = [];
      const set = (col: string, v: unknown) => {
        values.push(v);
        sets.push(`${col} = $${values.length}`);
      };
      if (patch.status !== undefined) set('status', patch.status);
      if (patch.stats !== undefined) set('stats', JSON.stringify(patch.stats));
      if (patch.buybox !== undefined) set('buybox', JSON.stringify(patch.buybox));
      if (patch.error !== undefined) set('error', patch.error);
      if (patch.sourceType !== undefined) set('source_type', patch.sourceType);
      if (!sets.length) return;
      values.push(id);
      await db.query(`UPDATE runs SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
    },
    async insertLeads(runId, leads) {
      if (!leads.length) return [];
      const values: unknown[] = [];
      const tuples = leads.map((lead) => {
        const placeholders = LEAD_COLUMNS.map(([key, , json]) => {
          values.push(key === 'runId' ? runId : toParam(key, lead[key], json));
          return `$${values.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const { rows } = await db.query<Row>(
        `INSERT INTO leads (${LEAD_COLUMNS.map(([, c]) => c).join(', ')}) VALUES ${tuples.join(', ')} RETURNING *`,
        values,
      );
      return rows.map(rowToLead);
    },
    async updateLead(id, patch) {
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(patch) as Array<[keyof NewLead, unknown]>) {
        const meta = COLUMN_OF.get(key);
        if (!meta) continue;
        values.push(toParam(key, value, meta[1]));
        sets.push(`${meta[0]} = $${values.length}`);
      }
      if (!sets.length) return;
      values.push(id);
      await db.query(`UPDATE leads SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    },
    async updateScores(updates) {
      if (!updates.length) return;
      await db.query(
        `UPDATE leads AS l SET score = v.score, tier = v.tier, reasons = v.reasons, why_call = v.why_call
           FROM jsonb_to_recordset($1::jsonb) AS v(id uuid, score int, tier text, reasons jsonb, why_call text)
          WHERE l.id = v.id`,
        [JSON.stringify(updates.map((u) => ({ id: u.id, score: u.score, tier: u.tier, reasons: u.reasons, why_call: u.whyCall })))],
      );
    },
    async listLeads(runId) {
      if (!isUuid(runId)) return [];
      const { rows } = await db.query<Row>(`SELECT * FROM leads WHERE run_id = $1 ORDER BY created_at, id`, [runId]);
      return rows.map(rowToLead);
    },
    async failOrphanedRuns(message) {
      const { rowCount } = await db.query(
        `UPDATE runs SET status = 'failed', error = $1, updated_at = now() WHERE status IN ('queued', 'running')`,
        [message],
      );
      return rowCount ?? 0;
    },
  };
}
