import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CALLSHEET_HEADER, CSV_HEADER, HUBSPOT_HEADER } from '../../src/export/formats.js';
import { testApp } from '../helpers/apiApp.js';

const startDiscovery = async (ctx: ReturnType<typeof testApp>, body: object) => {
  const res = await request(ctx.app).post('/api/runs/discover').send(body);
  if (res.status === 202) await ctx.runner.wait(res.body.runId);
  return res;
};

describe('GET /api/meta', () => {
  it('lists the four trades, states and default weights', async () => {
    const res = await request(testApp().app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.trades.map((t: { key: string }) => t.key)).toEqual(['hvac', 'plumbing', 'electrical', 'roofing']);
    expect(res.body.states).toContainEqual({ code: 'TX', name: 'Texas' });
    expect(res.body.defaultWeights).toMatchObject({ age20: 20, franchise: -30 });
  });
});

describe('POST /api/runs/discover', () => {
  it('202 + runId, then the job runs to done with a report', async () => {
    const ctx = testApp();
    const res = await startDiscovery(ctx, { trade: 'hvac', state: 'tx' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'queued', sourceType: 'osm' });

    const run = await request(ctx.app).get(`/api/runs/${res.body.runId}`);
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ status: 'done', params: { trade: 'hvac', state: 'TX' }, progress: { stage: 'done', pct: 100 } });
    const s = run.body.stats;
    expect(s.rowsIn).toEqual({ osm: 38 }); // the 38 craft=hvac rows in osm-test.json
    expect(s).toMatchObject({ duplicatesMerged: 1, unique: 37 }); // Elite Heating listed twice
    expect(s.sites).toMatchObject({ ok: 3, blocked: 1, unreachable: 33, noWebsite: 0 });
    expect(s.tiers.A + s.tiers.B + s.tiers.C).toBe(37);
    expect(s.completeness.after).toBeGreaterThan(s.completeness.before);
    expect(s.fieldsFilled).toBeGreaterThan(0);
    expect(s.timings.finishedAt).toBeTruthy();
    expect(run.body.buybox.states).toEqual(['TX']);
  });

  it.each([
    [{ trade: 'landscaping', state: 'TX' }, /trade must be one of/],
    [{ trade: 'hvac', state: 'Texass' }, /US state code/],
    [{}, /trade/],
  ])('400 for %j', async (body, message) => {
    const res = await request(testApp().app).post('/api/runs/discover').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(message);
  });

  it('Overpass down + TX → seed list with a notice', async () => {
    const ctx = testApp({ overpassDown: true });
    const res = await startDiscovery(ctx, { trade: 'plumbing', state: 'TX' });
    const run = await request(ctx.app).get(`/api/runs/${res.body.runId}`);
    expect(run.body).toMatchObject({ status: 'done', sourceType: 'seed' });
    expect(run.body.notice).toMatch(/seed list/);
    expect(run.body.stats.rowsIn.seed).toBeGreaterThan(0);
  });

  it('Overpass down + a trade the seed list lacks → failed, never other trades', async () => {
    const ctx = testApp({ overpassDown: true });
    const res = await startDiscovery(ctx, { trade: 'roofing', state: 'TX' });
    const run = await request(ctx.app).get(`/api/runs/${res.body.runId}`);
    expect(run.body).toMatchObject({ status: 'failed' });
    expect(run.body.error).toMatch(/seed list has no roofing businesses/);
    expect((await request(ctx.app).get(`/api/runs/${res.body.runId}/leads`)).body.total).toBe(0);
  });

  it('Overpass down + seed fallback keeps only the requested trade', async () => {
    const ctx = testApp({ overpassDown: true });
    const res = await startDiscovery(ctx, { trade: 'electrical', state: 'TX' });
    const leads = await request(ctx.app).get(`/api/runs/${res.body.runId}/leads`);
    expect(leads.body.total).toBeGreaterThan(0);
    expect(leads.body.items.every((l: { industry: string }) => l.industry === 'electrical')).toBe(true);
  });

  it('Overpass down + another state → failed with a readable error', async () => {
    const ctx = testApp({ overpassDown: true });
    const res = await startDiscovery(ctx, { trade: 'plumbing', state: 'OK' });
    const run = await request(ctx.app).get(`/api/runs/${res.body.runId}`);
    expect(run.body).toMatchObject({ status: 'failed' });
    expect(run.body.error).toMatch(/OpenStreetMap is unavailable/);
  });
});

describe('POST /api/runs/import', () => {
  it('uploads a CSV → 202 with rows and warnings', async () => {
    const ctx = testApp();
    const csv = 'Company,Website,Company Phone,City,State\nGeorge Plumbing,yell4george.com,(210) 495-9991,San Antonio,TX\nN/A,N/A,,,\n';
    const res = await request(ctx.app).post('/api/runs/import').attach('file', Buffer.from(csv), 'leads.csv');
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ sourceType: 'csv', rows: 1 });
    expect(res.body.warnings.join(' ')).toMatch(/skipped/);
    await ctx.runner.wait(res.body.runId);
    const leads = await request(ctx.app).get(`/api/runs/${res.body.runId}/leads`);
    expect(leads.body.items[0]).toMatchObject({ company: 'George Plumbing', yearFounded: 1947, ownerRole: 'founder', size: 'not estimated' });
    expect(leads.body.items[0].filled).toContain('yearFounded');
  });

  it('sample=true runs the synthetic CSV + seed list', async () => {
    const ctx = testApp();
    const res = await request(ctx.app).post('/api/runs/import').field('sample', 'true');
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ sourceType: 'sample', rows: 52 });
    await ctx.runner.wait(res.body.runId);
    const run = await request(ctx.app).get(`/api/runs/${res.body.runId}`);
    expect(run.body.stats).toMatchObject({ rowsIn: { csv: 12, seed: 40 }, unique: 45, duplicatesMerged: 7, crossSourceDuplicates: 5 });
  });

  it('422 when there is no company column', async () => {
    const res = await request(testApp().app).post('/api/runs/import').attach('file', Buffer.from('website\nacme.com\n'), 'x.csv');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CSV_NO_COMPANY_COLUMN');
  });

  it('422 for more than 200 rows', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => `Co ${i}`).join('\n');
    const res = await request(testApp().app).post('/api/runs/import').attach('file', Buffer.from(`company\n${rows}\n`), 'x.csv');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CSV_TOO_MANY_ROWS');
  });

  it('400 with neither a file nor sample', async () => {
    const res = await request(testApp().app).post('/api/runs/import');
    expect(res.status).toBe(400);
  });

  it('413 for a file over 2 MB', async () => {
    const res = await request(testApp().app).post('/api/runs/import').attach('file', Buffer.alloc(2 * 1024 * 1024 + 10, 'a'), 'big.csv');
    expect(res.status).toBe(413);
  });
});

describe('GET /api/runs/:id', () => {
  it('404 for an unknown or malformed id', async () => {
    const { app } = testApp();
    expect((await request(app).get('/api/runs/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await request(app).get('/api/runs/not-a-uuid')).status).toBe(404);
  });
});

describe('GET /api/runs/:id/leads', () => {
  it('ranks by score and filters by tier, phone, owner and state', async () => {
    const ctx = testApp();
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    const all = await request(ctx.app).get(`/api/runs/${body.runId}/leads`);
    expect(all.body.total).toBe(37);
    const scores = all.body.items.map((l: { score: number }) => l.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(all.body.items[0]).toMatchObject({ company: 'Air-Stream Heating & AC Co', tier: 'A' });
    expect(all.body.items[0].topReasons).toHaveLength(3);

    const a = await request(ctx.app).get(`/api/runs/${body.runId}/leads?tier=A`);
    expect(a.body.items.every((l: { tier: string }) => l.tier === 'A')).toBe(true);
    expect(a.body.filtered).toBe(all.body.counts.A);

    const owners = await request(ctx.app).get(`/api/runs/${body.runId}/leads?hasOwner=true`);
    expect(owners.body.items.map((l: { ownerName: string }) => l.ownerName).sort()).toEqual(['Kyle Bacon', 'Randy Bellomy']);

    const byName = await request(ctx.app).get(`/api/runs/${body.runId}/leads?sort=name&state=TX&hasPhone=true`);
    const names = byName.body.items.map((l: { company: string }) => l.company.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it('400 on a bad filter', async () => {
    const ctx = testApp();
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    expect((await request(ctx.app).get(`/api/runs/${body.runId}/leads?tier=D`)).status).toBe(400);
  });
});

describe('PUT /api/runs/:id/buybox', () => {
  it('rescoring without TX lowers scores by 5 and makes no new requests', async () => {
    const crawlCalls: string[] = [];
    const ctx = testApp({ crawlCalls });
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    const before = await request(ctx.app).get(`/api/runs/${body.runId}/leads?sort=name`);
    const callsBefore = crawlCalls.length;

    const res = await request(ctx.app).put(`/api/runs/${body.runId}/buybox`).send({ states: ['OK'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rescored: 37, buybox: { states: ['OK'] } });
    expect(crawlCalls.length).toBe(callsBefore);

    const after = await request(ctx.app).get(`/api/runs/${body.runId}/leads?sort=name`);
    after.body.items.forEach((l: { score: number }, i: number) => {
      const was = before.body.items[i].score as number;
      expect(l.score).toBe(Math.max(0, was - 5));
    });
    const run = await request(ctx.app).get(`/api/runs/${body.runId}`);
    expect(run.body.stats.tiers).toEqual(res.body.tiers);
  });

  it('400 for unknown weights or states', async () => {
    const ctx = testApp();
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    expect((await request(ctx.app).put(`/api/runs/${body.runId}/buybox`).send({ weights: { baseline: 26 } })).status).toBe(400);
    expect((await request(ctx.app).put(`/api/runs/${body.runId}/buybox`).send({ states: ['ZZ'] })).status).toBe(400);
  });

  it('409 while the run is in progress', async () => {
    const ctx = testApp({ crawlDelayMs: 30 });
    const res = await request(ctx.app).post('/api/runs/discover').send({ trade: 'hvac', state: 'TX' });
    const put = await request(ctx.app).put(`/api/runs/${res.body.runId}/buybox`).send({ states: ['OK'] });
    expect(put.status).toBe(409);
    await ctx.runner.wait(res.body.runId);
  });
});

describe('POST /api/runs/:id/cancel', () => {
  it('cancels a running job; processed leads stay visible', async () => {
    const ctx = testApp({ crawlDelayMs: 30 });
    const res = await request(ctx.app).post('/api/runs/discover').send({ trade: 'hvac', state: 'TX' });
    const cancel = await request(ctx.app).post(`/api/runs/${res.body.runId}/cancel`);
    expect(cancel.body).toMatchObject({ status: 'cancelled' });
    await ctx.runner.wait(res.body.runId);
    const run = await request(ctx.app).get(`/api/runs/${res.body.runId}`);
    expect(run.body.status).toBe('cancelled');
    expect(run.body.progress.processed).toBeLessThan(37);
    const leads = await request(ctx.app).get(`/api/runs/${res.body.runId}/leads`);
    expect(leads.body.total).toBe(37); // all rows were stored; unprocessed ones have no score yet
    expect((await request(ctx.app).post(`/api/runs/${res.body.runId}/cancel`)).status).toBe(409);
  });
});

describe('GET /api/runs/:id/export', () => {
  const firstLine = (text: string) => text.split('\r\n')[0];
  const rows = (text: string) => text.trim().split('\r\n').length - 1;

  it('csv / callsheet / hubspot: headers, filename and row count', async () => {
    const ctx = testApp();
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    const counts = (await request(ctx.app).get(`/api/runs/${body.runId}/leads`)).body.counts;

    const csv = await request(ctx.app).get(`/api/runs/${body.runId}/export?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toBe('attachment; filename="sellsignal-leads.csv"');
    expect(firstLine(csv.text)).toBe(CSV_HEADER.join(','));
    expect(rows(csv.text)).toBe(37);
    expect(csv.headers['x-row-count']).toBe('37');
    expect(csv.text).toContain('not estimated');

    const sheet = await request(ctx.app).get(`/api/runs/${body.runId}/export?format=callsheet`);
    expect(firstLine(sheet.text)).toBe(CALLSHEET_HEADER.join(','));
    expect(rows(sheet.text)).toBe(counts.A + counts.B);
    expect(sheet.headers['x-row-count']).toBe(String(counts.A + counts.B));
    expect(sheet.text.split('\r\n')[1]).toMatch(/,,,$/); // empty outcome, notes, follow-up

    const hub = await request(ctx.app).get(`/api/runs/${body.runId}/export?format=hubspot`);
    expect(firstLine(hub.text)).toBe(HUBSPOT_HEADER.join(','));
    expect(hub.text).toContain('Construction');
  });

  it('applies the same filters as the list', async () => {
    const ctx = testApp();
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    const a = await request(ctx.app).get(`/api/runs/${body.runId}/export?format=csv&tier=A`);
    const listA = await request(ctx.app).get(`/api/runs/${body.runId}/leads?tier=A`);
    expect(a.headers['x-row-count']).toBe(String(listA.body.filtered));
  });

  it('400 for an unknown format', async () => {
    const ctx = testApp();
    const { body } = await startDiscovery(ctx, { trade: 'hvac', state: 'TX' });
    expect((await request(ctx.app).get(`/api/runs/${body.runId}/export?format=pdf`)).status).toBe(400);
  });
});
