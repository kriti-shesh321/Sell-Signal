import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAiRun, rateLimiter, type AiClient } from '../../src/enrich/ai/index.js';
import { groundAnswer } from '../../src/enrich/ai/ground.js';
import type { AiAnswer, PageText } from '../../src/enrich/ai/prompt.js';
import { memoryDomainCache } from '../../src/enrich/cache.js';
import type { FetchedPage } from '../../src/enrich/crawl.js';
import { visibleText } from '../../src/enrich/extract/util.js';
import { applyAiFacts, applySiteFacts } from '../../src/pipeline/applyFacts.js';
import { fixtureLead, NOW } from '../helpers/fixtureLeads.js';

const MODEL = 'gemini-test';
const aboutHtml = readFileSync(new URL('../fixtures/html/real-airstream-about.html', import.meta.url), 'utf8');
const pages: PageText[] = [{ source: 'website:/About-air-stream.html', text: visibleText(aboutHtml) }];
const fetched: FetchedPage[] = [{ role: 'about', path: '/About-air-stream.html', url: 'https://www.air-streamservices.com/About-air-stream.html', html: aboutHtml }];

const none: AiAnswer = { ownerName: null, ownerRole: null, ownerQuote: null, foundedYear: null, foundedQuote: null, familyOwned: null, familyQuote: null };
const flores: AiAnswer = {
  ...none,
  ownerName: 'Richard Flores',
  ownerRole: 'founder',
  ownerQuote: 'Richard Flores started Air-Stream in 1974 with one truck named "Tortilla."',
  familyOwned: true,
  familyQuote: 'family owned and operated Air-Stream Air Conditioning and Heating Co. Inc.',
};

describe('groundAnswer (anti-hallucination guard)', () => {
  it('keeps an owner whose quote is on the page, labelled as AI with page + evidence', () => {
    const r = groundAnswer(flores, pages, { model: MODEL, now: NOW });
    expect(r.ownerName).toMatchObject({
      value: 'Richard Flores',
      role: 'founder',
      method: 'AI',
      source: 'AI (gemini-test) from website:/About-air-stream.html',
    });
    expect(r.ownerName!.evidence).toContain('Richard Flores started Air-Stream');
    expect(r.familyOwned).toMatchObject({ value: true, method: 'AI' });
    expect(r.rejected).toEqual([]);
  });

  it('rejects an invented owner (quote not on the page)', () => {
    const r = groundAnswer({ ...none, ownerName: 'Maria Lopez', ownerQuote: 'Maria Lopez founded Air-Stream in 1974.' }, pages, { model: MODEL, now: NOW });
    expect(r.ownerName).toBeNull();
    expect(r.rejected).toEqual(['ownerName: quote not on the page']);
  });

  it('rejects a name that is not in its quote, and a company passed off as a person', () => {
    const notInQuote = groundAnswer({ ...none, ownerName: 'Richard Flores', ownerQuote: 'Owned by Richard and Rebecca Flores' }, pages, { model: MODEL, now: NOW });
    expect(notInQuote.rejected).toEqual(['ownerName: name not in the quote']);
    const company = groundAnswer({ ...none, ownerName: 'Air-Stream Air Conditioning', ownerQuote: flores.familyQuote }, pages, { model: MODEL, now: NOW });
    expect(company.ownerName).toBeNull();
  });

  it('keeps a grounded founding year; rejects © lines, out-of-range and unquoted years', () => {
    const page = [{ source: 'website:/', text: 'We opened our doors in 1988.\n© 2015 Smith Plumbing. All rights reserved.\nPlanning for 2031.' }];
    const ok = groundAnswer({ ...none, foundedYear: 1988, foundedQuote: 'We opened our doors in 1988.' }, page, { model: MODEL, now: NOW });
    expect(ok.yearFounded).toMatchObject({ value: 1988, method: 'AI', evidence: 'We opened our doors in 1988.' });
    const copy = groundAnswer({ ...none, foundedYear: 2015, foundedQuote: '© 2015 Smith Plumbing.' }, page, { model: MODEL, now: NOW });
    expect(copy.rejected).toEqual(['yearFounded: year comes from a copyright line']);
    const future = groundAnswer({ ...none, foundedYear: 2031, foundedQuote: 'Planning for 2031.' }, page, { model: MODEL, now: NOW });
    expect(future.rejected[0]).toMatch(/outside 1900/);
    const wrong = groundAnswer({ ...none, foundedYear: 1985, foundedQuote: 'We opened our doors in 1988.' }, page, { model: MODEL, now: NOW });
    expect(wrong.rejected).toEqual(['yearFounded: year not in the quote']);
  });

  it('role must be backed by the quote: a buyer is the owner, a founder needs founding words', () => {
    const page = [
      {
        source: 'website:/about/',
        text: 'Smith Plumbing was founded in 1982 by Glenn and Petra Smith. In 2017, Erin Smith Clark, the founders’ daughter and Daniel Thompson purchased the company.',
      },
    ];
    const quote = 'In 2017, Erin Smith Clark, the founders’ daughter and Daniel Thompson purchased the company.';
    const asFounder = groundAnswer({ ...none, ownerName: 'Erin Smith Clark', ownerRole: 'founder', ownerQuote: quote }, page, { model: MODEL, now: NOW });
    expect(asFounder.ownerName).toMatchObject({ value: 'Erin Smith Clark', role: 'owner' });
    const noRole = groundAnswer({ ...none, ownerName: 'Erin Smith Clark', ownerQuote: quote }, page, { model: MODEL, now: NOW });
    expect(noRole.ownerName?.role).toBe('owner');
  });

  it('rejects family-owned when the quote does not talk about family', () => {
    const r = groundAnswer({ ...none, familyOwned: true, familyQuote: 'Our business is all about building relationships with our customers.' }, pages, { model: MODEL, now: NOW });
    expect(r.familyOwned).toBeNull();
    expect(r.rejected).toEqual(['familyOwned: quote does not mention family']);
  });
});

describe('createAiRun', () => {
  const setup = (client: AiClient, maxCalls = 5, extra: Partial<Parameters<typeof createAiRun>[0]> = {}) => {
    const cache = memoryDomainCache({ days: 7, unreachableDays: 1 }, () => NOW);
    const recrawl = vi.fn(async () => ({ status: 'ok' as const, html: fetched }));
    const run = createAiRun({ client, maxCalls, cache, recrawl, now: () => NOW, ...extra });
    return { run, cache, recrawl };
  };
  const stub = (impl: AiClient['extract'] = async () => flores) => ({ model: MODEL, extract: vi.fn(impl) });

  it('asks once, grounds the answer and caches it in domain_cache.data.ai', async () => {
    const client = stub();
    const { run, cache } = setup(client);
    await cache.put('air-streamservices.com', { version: 3, status: 'ok', facts: {} }, 'ok');
    const facts = await run.fill('air-streamservices.com', { status: 'ok', html: fetched }, 'Air-Stream');
    expect(facts?.ownerName?.value).toBe('Richard Flores');
    expect(client.extract).toHaveBeenCalledOnce();
    expect(client.extract.mock.calls[0]![0].pages[0]!.text).toContain('Owned by Richard and Rebecca Flores');
    const stored = await cache.get<{ version: number; ai: { ownerName: { value: string } } }>('air-streamservices.com');
    expect(stored?.data).toMatchObject({ version: 3, ai: { ownerName: { value: 'Richard Flores' } } });
    expect(run.stats).toMatchObject({ enabled: true, model: MODEL, calls: 1, errors: 0 });
  });

  it('reuses a cached AI answer without calling the provider', async () => {
    const client = stub();
    const first = setup(client);
    const cachedAi = (await first.run.fill('a.com', { status: 'ok', html: fetched }, null))!;
    const { run } = setup(client);
    const again = await run.fill('a.com', { status: 'ok', ai: cachedAi }, null);
    expect(again).toEqual(cachedAi);
    expect(client.extract).toHaveBeenCalledOnce();
    expect(run.stats).toMatchObject({ calls: 0, cached: 1 });
  });

  it('asks again when the cached AI answer came from an older prompt/guard version', async () => {
    const client = stub();
    const { run } = setup(client);
    const old = { version: 1, model: MODEL, ownerName: null, yearFounded: null, familyOwned: null, rejected: [] };
    await run.fill('a.com', { status: 'ok', html: fetched, ai: old }, null);
    expect(client.extract).toHaveBeenCalledOnce();
    expect(run.stats).toMatchObject({ calls: 1, cached: 0 });
  });

  it('re-fetches the pages of a cached site that has no AI answer yet', async () => {
    const { run, recrawl } = setup(stub());
    const facts = await run.fill('a.com', { status: 'ok', html: [] }, null);
    expect(recrawl).toHaveBeenCalledWith('a.com');
    expect(facts?.ownerName?.value).toBe('Richard Flores');
  });

  it('respects AI_MAX_CALLS_PER_RUN, even with sites in flight at once', async () => {
    const client = stub();
    const { run } = setup(client, 2);
    await Promise.all(['a.com', 'b.com', 'c.com'].map((d) => run.fill(d, { status: 'ok', html: fetched }, null)));
    expect(client.extract).toHaveBeenCalledTimes(2);
    expect(run.stats).toMatchObject({ calls: 2, skippedCap: 1 });
  });

  it('a provider error is skipped and counted; the run carries on', async () => {
    let n = 0;
    const client = stub(async () => {
      if (n++ === 0) throw new Error('model overloaded');
      return flores;
    });
    const { run } = setup(client);
    expect(await run.fill('a.com', { status: 'ok', html: fetched }, null)).toBeNull();
    expect(await run.fill('b.com', { status: 'ok', html: fetched }, null)).not.toBeNull();
    expect(run.stats).toMatchObject({ calls: 2, errors: 1, stopped: null });
  });

  it('a quota error (429) stops further calls for the run', async () => {
    const client = stub(async () => {
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    });
    const { run } = setup(client, 5, { errorStatus: (e) => (e as { status?: number }).status ?? null });
    await run.fill('a.com', { status: 'ok', html: fetched }, null);
    await run.fill('b.com', { status: 'ok', html: fetched }, null);
    expect(client.extract).toHaveBeenCalledOnce();
    expect(run.stats).toMatchObject({ errors: 1, stopped: 'rate limit or quota reached' });
  });

  it('skips sites that were not read, and pages with almost no text, without spending a call', async () => {
    const client = stub();
    const { run } = setup(client);
    expect(await run.fill('a.com', { status: 'blocked' }, null)).toBeNull();
    const tiny: FetchedPage[] = [{ role: 'home', path: '/', url: 'https://a.com/', html: '<p>Welcome</p>' }];
    expect(await run.fill('a.com', { status: 'ok', html: tiny }, null)).toBeNull();
    expect(client.extract).not.toHaveBeenCalled();
    expect(run.stats.calls).toBe(0);
  });
});

describe('rateLimiter', () => {
  it('spaces calls 60/N seconds apart', async () => {
    let t = 0;
    const waits: number[] = [];
    const pace = rateLimiter(15, async (ms) => void waits.push(ms), () => t);
    await Promise.all([pace(), pace(), pace()]);
    expect(waits).toEqual([4000, 8000]);
    t = 20_000; // long after the last slot: no wait
    await pace();
    expect(waits).toHaveLength(2);
  });
});

describe('applyAiFacts', () => {
  it('fills only what the rules left empty and never overwrites rule values', () => {
    const lead = fixtureLead('air-streamservices.com'); // rules: year 1974 + family-owned, no owner
    const ai = groundAnswer({ ...flores, foundedYear: 1974, foundedQuote: 'Richard Flores started Air-Stream in 1974' }, pages, { model: MODEL, now: NOW });
    const ruleFamily = lead.signals!.familyOwned;
    expect(applyAiFacts(lead, ai)).toEqual(['ownerName']);
    expect(lead).toMatchObject({ ownerName: 'Richard Flores', ownerRole: 'founder', yearFounded: 1974 });
    expect(lead.fieldSources.ownerName).toMatchObject({ method: 'AI', source: expect.stringMatching(/^AI \(gemini-test\)/) });
    expect(lead.fieldSources.yearFounded?.method).not.toBe('AI');
    expect(lead.signals!.familyOwned).toBe(ruleFamily);
    expect(lead.filled).toContain('ownerName');
  });

  it('adds an AI family-owned signal when the rules found none', () => {
    const lead = applySiteFacts(fixtureLead('bellomyims.com'), null);
    lead.signals = { familyOwned: null, franchise: null, nonprofit: null, copyrightYear: null, hasViewport: true, https: true };
    const ai = groundAnswer(flores, pages, { model: MODEL, now: NOW });
    expect(applyAiFacts(lead, ai)).toContain('familyOwned');
    expect(lead.signals.familyOwned?.method).toBe('AI');
  });
});
