import { request, type Dispatcher } from 'undici';
import { tradeFromOsmCraft, type Trade } from './trades.js';
import type { SourceAdapter } from './types.js';
import type { RawLead } from '../types.js';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
  remark?: string;
}

export class OverpassUnavailableError extends Error {
  constructor(public readonly attempts: string[]) {
    super(`OpenStreetMap (Overpass) is unavailable: ${attempts.join('; ')}`);
    this.name = 'OverpassUnavailableError';
  }
}

/** Overpass QL: businesses with a website for one trade inside one US state. */
export function buildOverpassQuery(trade: Trade, stateCode: string, max: number): string {
  const { key, value } = trade.osm;
  return (
    `[out:json][timeout:60];` +
    `area["ISO3166-2"="US-${stateCode}"][admin_level=4]->.a;` +
    `nwr["${key}"="${value}"][~"^(website|contact:website)$"~"."](area.a);` +
    `out tags center ${max};`
  );
}

/** Overpass elements → RawLeads. `defaultState` fills a missing addr:state (the search area is known). */
export function mapOsmElements(json: OverpassResponse, opts: { defaultState?: string } = {}): RawLead[] {
  const leads: RawLead[] = [];
  for (const el of json.elements) {
    const t = el.tags ?? {};
    if (!t.name) continue;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const unit = t['addr:unit'] ?? t['addr:suite'];
    leads.push({
      source: 'osm',
      raw: { osmType: el.type, osmId: el.id, ...t },
      company: t.name,
      website: t.website ?? t['contact:website'] ?? null,
      phone: t.phone ?? t['contact:phone'] ?? null,
      email: t.email ?? t['contact:email'] ?? null,
      street: street ? (unit ? `${street} #${unit}` : street) : null,
      city: t['addr:city'] ?? null,
      state: t['addr:state'] ?? opts.defaultState ?? null,
      industry: tradeFromOsmCraft(t.craft),
      // start_date is the OSM tag for when a business began operating.
      yearFounded: t.start_date ?? null,
    });
  }
  return leads;
}

export interface OverpassClientOptions {
  /** Primary first, then mirrors. */
  urls: string[];
  userAgent: string;
  timeoutMs?: number;
  dispatcher?: Dispatcher;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST the query: primary, one retry with backoff, then each mirror once. */
export async function fetchOverpass(query: string, opts: OverpassClientOptions): Promise<OverpassResponse> {
  const [primary, ...mirrors] = opts.urls;
  if (!primary) throw new Error('No Overpass URL configured');
  const attempts = [primary, primary, ...mirrors];
  const sleep = opts.sleep ?? defaultSleep;
  const timeout = opts.timeoutMs ?? 65_000;
  const failures: string[] = [];

  for (const [i, url] of attempts.entries()) {
    if (i > 0) await sleep(i === 1 ? 1000 : 500);
    try {
      const res = await request(url, {
        method: 'POST',
        headers: {
          'user-agent': opts.userAgent,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }).toString(),
        headersTimeout: timeout,
        bodyTimeout: timeout,
        dispatcher: opts.dispatcher,
      });
      if (res.statusCode !== 200) {
        await res.body.dump();
        throw new Error(`HTTP ${res.statusCode}`);
      }
      const json = (await res.body.json()) as OverpassResponse;
      if (!Array.isArray(json.elements)) throw new Error('response has no elements');
      if (json.elements.length === 0 && json.remark && /error|timed out|timeout/i.test(json.remark)) {
        throw new Error(`query failed: ${json.remark}`);
      }
      return json;
    } catch (err) {
      failures.push(`${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new OverpassUnavailableError(failures);
}

export interface OsmParams {
  trade: Trade;
  state: string;
}

export function osmAdapter(opts: OverpassClientOptions & { max: number }): SourceAdapter<OsmParams> {
  return {
    name: 'osm',
    async load({ trade, state }) {
      const json = await fetchOverpass(buildOverpassQuery(trade, state, opts.max), opts);
      return mapOsmElements(json, { defaultState: state }).slice(0, opts.max);
    },
  };
}
