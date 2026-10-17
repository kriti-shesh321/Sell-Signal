import { OverpassUnavailableError } from '../sources/osm.js';
import type { Trade } from '../sources/trades.js';
import type { RawLead } from '../types.js';
import type { LoadResult } from './job.js';

export interface SourceDeps {
  /** OpenStreetMap discovery for one trade in one state. */
  discover(trade: Trade, state: string): Promise<RawLead[]>;
  /** Seed list (Texas, hand-picked from an OSM snapshot). */
  seed(): RawLead[];
  sampleCsv(): Promise<string>;
}

export const SEED_NOTICE = 'OpenStreetMap is unavailable right now, so this run uses the seed list (Texas businesses hand-picked from an OpenStreetMap snapshot).';

/** OSM discovery; if Overpass is down, Texas falls back to the seed list and other states fail clearly. */
export function discoverLoader(sources: SourceDeps, trade: Trade, state: string): () => Promise<LoadResult> {
  return async () => {
    try {
      return { leads: await sources.discover(trade, state) };
    } catch (err) {
      if (!(err instanceof OverpassUnavailableError)) throw err;
      // Only the same trade from the seed list: never substitute other trades' businesses.
      const leads = state === 'TX' ? sources.seed().filter((l) => l.industry === trade.key) : [];
      if (leads.length) return { leads, sourceType: 'seed', notice: SEED_NOTICE };
      const why = state === 'TX' ? ` and the seed list has no ${trade.label === 'HVAC' ? 'HVAC' : trade.label.toLowerCase()} businesses` : '';
      throw new Error(`OpenStreetMap is unavailable right now${why}. Try again in a minute, or import a CSV instead.`);
    }
  };
}
