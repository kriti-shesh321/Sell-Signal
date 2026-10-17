import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchUrl, type FetcherOptions } from '../../src/enrich/fetcher.js';

const SITE = 'https://smith.test';
const HTML = { 'content-type': 'text/html; charset=utf-8' };
let agent: MockAgent;
let opts: FetcherOptions;
const sleeps: number[] = [];

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  sleeps.length = 0;
  opts = { userAgent: 'SellSignal/test', dispatcher: agent, sleep: async (ms) => void sleeps.push(ms) };
});
afterEach(() => agent.close());

const site = () => agent.get(SITE);

describe('fetchUrl', () => {
  it('sends the User-Agent and returns the HTML', async () => {
    site().intercept({ path: '/', headers: { 'user-agent': 'SellSignal/test' } }).reply(200, '<h1>Hi</h1>', { headers: HTML });
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'ok', httpStatus: 200, body: '<h1>Hi</h1>', attempts: 1 });
  });

  it('retries once on 503, then succeeds', async () => {
    site().intercept({ path: '/' }).reply(503, 'busy');
    site().intercept({ path: '/' }).reply(200, 'ok', { headers: HTML });
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'ok', attempts: 2 });
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(800);
  });

  it('gives up after one retry on repeated 5xx', async () => {
    site().intercept({ path: '/' }).reply(502, '').times(2);
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'unreachable', reason: 'HTTP 502', attempts: 2 });
  });

  it('does not retry a 404', async () => {
    site().intercept({ path: '/missing' }).reply(404, 'nope');
    const r = await fetchUrl(`${SITE}/missing`, opts);
    expect(r).toMatchObject({ kind: 'http_error', httpStatus: 404, attempts: 1 });
    expect(sleeps).toHaveLength(0);
  });

  it('marks a 403 as blocked and never retries it', async () => {
    site().intercept({ path: '/' }).reply(403, 'Forbidden');
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'blocked', attempts: 1 });
  });

  it('marks a challenge page served with 200 as blocked', async () => {
    site().intercept({ path: '/' }).reply(200, '<title>Just a moment...</title>', { headers: HTML });
    expect((await fetchUrl(`${SITE}/`, opts)).kind).toBe('blocked');
  });

  it('times out slow responses and retries once', async () => {
    site().intercept({ path: '/' }).reply(200, 'late', { headers: HTML }).delay(300).times(2);
    const r = await fetchUrl(`${SITE}/`, { ...opts, timeoutMs: 50 });
    expect(r).toMatchObject({ kind: 'unreachable', reason: 'timeout', attempts: 2 });
  });

  it('retries network errors', async () => {
    site().intercept({ path: '/' }).replyWithError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })).times(2);
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'unreachable', attempts: 2 });
  });

  it('does not retry a DNS failure', async () => {
    site().intercept({ path: '/' }).replyWithError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'unreachable', reason: 'ENOTFOUND', attempts: 1 });
  });

  it('follows redirects, including to another host', async () => {
    site().intercept({ path: '/' }).reply(301, '', { headers: { location: 'https://www.smith.test/' } });
    agent.get('https://www.smith.test').intercept({ path: '/' }).reply(200, 'home', { headers: HTML });
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r).toMatchObject({ kind: 'ok', finalUrl: 'https://www.smith.test/' });
  });

  it('stops after 3 redirects', async () => {
    for (let i = 0; i < 4; i++) {
      site().intercept({ path: `/r${i}` }).reply(302, '', { headers: { location: `/r${i + 1}` } });
    }
    const r = await fetchUrl(`${SITE}/r0`, opts);
    expect(r).toMatchObject({ kind: 'unreachable', reason: 'more than 3 redirects', attempts: 1 });
  });

  it('checks allow() before every hop', async () => {
    site().intercept({ path: '/' }).reply(301, '', { headers: { location: '/private/home' } });
    const r = await fetchUrl(`${SITE}/`, { ...opts, allow: async (u) => !u.pathname.startsWith('/private') });
    expect(r).toMatchObject({ kind: 'disallowed', finalUrl: `${SITE}/private/home` });
  });

  it('reports non-HTML content', async () => {
    site().intercept({ path: '/menu.pdf' }).reply(200, '%PDF', { headers: { 'content-type': 'application/pdf' } });
    expect((await fetchUrl(`${SITE}/menu.pdf`, opts)).kind).toBe('not_html');
  });

  it('caps the body size', async () => {
    site().intercept({ path: '/' }).reply(200, 'x'.repeat(5000), { headers: HTML });
    const r = await fetchUrl(`${SITE}/`, { ...opts, maxBytes: 1000 });
    expect(r.kind === 'ok' && r.body.length).toBe(1000);
    expect(r.kind === 'ok' && r.truncated).toBe(true);
  });

  it('decodes the declared charset', async () => {
    site()
      .intercept({ path: '/' })
      .reply(200, Buffer.from([0x43, 0x61, 0x66, 0xe9]), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } });
    const r = await fetchUrl(`${SITE}/`, opts);
    expect(r.kind === 'ok' && r.body).toBe('Café');
  });
});
