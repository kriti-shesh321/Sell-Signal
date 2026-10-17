import { readFileSync } from 'node:fs';
import { MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildOverpassQuery,
  fetchOverpass,
  mapOsmElements,
  OverpassUnavailableError,
  osmAdapter,
  type OverpassResponse,
} from '../../src/sources/osm.js';
import { getTrade, TRADES } from '../../src/sources/trades.js';
import { normalizeLead } from '../../src/pipeline/normalize.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/osm-test.json', import.meta.url), 'utf8'),
) as OverpassResponse;

const PRIMARY = 'https://overpass.test';
const MIRROR = 'https://mirror.test';
const noSleep = async () => {};

describe('mapOsmElements (osm-test.json fixture)', () => {
  const leads = mapOsmElements(fixture, { defaultState: 'TX' });

  it('maps all 50 named elements', () => {
    expect(leads).toHaveLength(50);
    expect(leads.every((l) => l.source === 'osm')).toBe(true);
  });

  it('picks name, website, phone, address and trade', () => {
    expect(leads[0]).toMatchObject({
      company: 'JD Precision Plumbing Services',
      website: 'https://www.jdprecisionplumbing.com/',
      phone: '+1-936-228-5000',
      street: '4050 FM 1488',
      city: 'Conroe',
      state: 'TX',
      industry: 'plumbing',
    });
    expect(leads[0]!.raw).toMatchObject({ osmType: 'node', osmId: 1681681417 });
  });

  it('formats units: "Suite 309" as written, a bare number with #', () => {
    const mk = (unit: string) =>
      mapOsmElements({ elements: [{ type: 'node', id: 1, tags: { name: 'X', 'addr:housenumber': '12', 'addr:street': 'Elm St', 'addr:unit': unit } }] })[0]!.street;
    expect(mk('Suite 309')).toBe('12 Elm St Suite 309');
    expect(mk('309')).toBe('12 Elm St #309');
    expect(mk('B')).toBe('12 Elm St #B');
  });

  it('fills a missing addr:state from the search area', () => {
    const george = leads.find((l) => l.company === 'George Plumbing Co.');
    expect(george?.state).toBe('TX');
  });

  it('uses contact:email and start_date', () => {
    const sf = leads.find((l) => l.company === 'Service First AC Repair & Plumbing');
    expect(sf).toMatchObject({ email: 'info@servicefirstactx.com', yearFounded: '1996' });
  });

  it('normalizes location subpages to the root domain', () => {
    const solar = leads.find((l) => l.company === 'Solar Power Systems Plano')!;
    expect(normalizeLead(solar).domain).toBe('texassolarpowersystems.com');
  });
});

describe('buildOverpassQuery', () => {
  it.each(TRADES.map((t) => [t.key, `${t.osm.key}"="${t.osm.value}`]))('%s uses its OSM tag', (key, tag) => {
    const q = buildOverpassQuery(getTrade(key)!, 'TX', 40);
    expect(q).toContain(`["${tag}"]`);
    expect(q).toContain('area["ISO3166-2"="US-TX"][admin_level=4]');
    expect(q).toContain('[~"^(website|contact:website)$"~"."]');
    expect(q).toContain('out tags center 40;');
  });
});

describe('fetchOverpass', () => {
  let agent: MockAgent;
  afterEach(async () => {
    await agent.close();
  });

  const setup = () => {
    agent = new MockAgent();
    agent.disableNetConnect();
    return { primary: agent.get(PRIMARY), mirror: agent.get(MIRROR) };
  };
  const call = () =>
    fetchOverpass('[out:json];', {
      urls: [`${PRIMARY}/api/interpreter`, `${MIRROR}/api/interpreter`],
      userAgent: 'SellSignal/test',
      dispatcher: agent,
      sleep: noSleep,
    });

  it('sends a POST with the User-Agent and returns the JSON', async () => {
    const { primary } = setup();
    primary
      .intercept({ path: '/api/interpreter', method: 'POST', headers: { 'user-agent': 'SellSignal/test' } })
      .reply(200, { elements: [] });
    await expect(call()).resolves.toEqual({ elements: [] });
  });

  it('retries the primary once, then succeeds', async () => {
    const { primary } = setup();
    primary.intercept({ path: '/api/interpreter', method: 'POST' }).reply(502, 'bad gateway');
    primary.intercept({ path: '/api/interpreter', method: 'POST' }).reply(200, fixture);
    const json = await call();
    expect(json.elements).toHaveLength(50);
  });

  it('falls back to the mirror after two primary failures', async () => {
    const { primary, mirror } = setup();
    primary.intercept({ path: '/api/interpreter', method: 'POST' }).reply(502, '').times(2);
    mirror.intercept({ path: '/api/interpreter', method: 'POST' }).reply(200, fixture);
    const json = await call();
    expect(json.elements).toHaveLength(50);
  });

  it('treats a 200 with a runtime-error remark and no elements as a failure', async () => {
    const { primary, mirror } = setup();
    primary
      .intercept({ path: '/api/interpreter', method: 'POST' })
      .reply(200, { elements: [], remark: 'runtime error: Query timed out' })
      .times(2);
    mirror.intercept({ path: '/api/interpreter', method: 'POST' }).reply(200, fixture);
    expect((await call()).elements).toHaveLength(50);
  });

  it('throws OverpassUnavailableError when every attempt fails', async () => {
    const { primary, mirror } = setup();
    primary.intercept({ path: '/api/interpreter', method: 'POST' }).reply(504, '').times(2);
    mirror.intercept({ path: '/api/interpreter', method: 'POST' }).reply(429, '');
    const err = await call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OverpassUnavailableError);
    expect((err as OverpassUnavailableError).attempts).toHaveLength(3);
  });

  it('osmAdapter caps results at max', async () => {
    const { primary } = setup();
    primary.intercept({ path: '/api/interpreter', method: 'POST' }).reply(200, fixture);
    const adapter = osmAdapter({
      urls: [`${PRIMARY}/api/interpreter`],
      userAgent: 'SellSignal/test',
      dispatcher: agent,
      sleep: noSleep,
      max: 10,
    });
    const leads = await adapter.load({ trade: getTrade('plumbing')!, state: 'TX' });
    expect(leads).toHaveLength(10);
  });
});
