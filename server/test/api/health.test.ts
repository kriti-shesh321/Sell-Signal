import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const base = { corsOrigins: ['http://localhost:5173'], version: '0.1.0', aiFallback: 'off' as const };

describe('GET /api/health', () => {
  it('returns 200 and db up when the database answers', async () => {
    const app = createApp({ ...base, db: { ping: async () => {} } });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up', version: '0.1.0', aiFallback: 'off' });
  });

  it('returns 503 and db down when the database fails', async () => {
    const app = createApp({
      ...base,
      db: {
        ping: async () => {
          throw new Error('connection refused');
        },
      },
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, db: 'down' });
  });

  it('allows the configured CORS origin', async () => {
    const app = createApp({ ...base, db: { ping: async () => {} } });
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const app = createApp({ ...base, db: { ping: async () => {} } });
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
