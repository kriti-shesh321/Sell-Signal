import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { createDb } from '../../src/db/pool.js';
import { pgRepo } from '../../src/db/repo.js';
import { defaultBuyBox } from '../../src/score/index.js';
import { emptyStats } from '../../src/runs/types.js';

// Runs only when TEST_DATABASE_URL points at a Postgres you don't mind writing a test run to.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('pgRepo against a real database', () => {
  const db = createDb(url ?? '');
  const repo = pgRepo(db);
  let runId = '';
  afterAll(async () => {
    if (runId) await db.query('DELETE FROM runs WHERE id = $1', [runId]);
    await db.close();
  });

  it('round-trips a run and its leads', async () => {
    await migrate(db);
    const run = await repo.createRun({ sourceType: 'csv', params: { fileName: 'smoke.csv' }, buybox: defaultBuyBox(['TX']), stats: emptyStats() });
    runId = run.id;
    const [lead] = await repo.insertLeads(run.id, [
      {
        runId: run.id, source: 'csv', raw: [{ source: 'csv', record: { company: 'Smoke Co' } }], company: 'Smoke Co', domain: 'smoke.test',
        website: 'https://smoke.test/', phone: '2145550101', email: null, street: null, city: 'Dallas', state: 'TX', industry: 'plumbing',
        yearFounded: null, ownerName: null, ownerRole: null, signals: null, fieldSources: { company: { source: 'CSV import' } },
        validation: null, completenessBefore: 50, completenessAfter: null, score: null, tier: null, reasons: [], whyCall: null,
        mergedFrom: [], filled: [],
      },
    ]);
    await repo.updateLead(lead!.id, { score: 72, tier: 'A', yearFounded: 1985, filled: ['yearFounded'], ownerRole: 'founder', ownerName: 'Ann Lee' });
    await repo.updateRun(run.id, { status: 'done', stats: { ...emptyStats(), unique: 1 } });

    const [back] = await repo.listLeads(run.id);
    expect(back).toMatchObject({ company: 'Smoke Co', score: 72, tier: 'A', yearFounded: 1985, filled: ['yearFounded'], ownerRole: 'founder', signals: null, validation: null });
    expect(await repo.getRun(run.id)).toMatchObject({ status: 'done', stats: { unique: 1 } });
    expect(await repo.getRun('not-a-uuid')).toBeNull();
  });
});
