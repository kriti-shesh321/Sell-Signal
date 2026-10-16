import type { RawLead, SourceName } from '../types.js';

/** A pluggable lead source. Each adapter turns its own input into RawLeads. */
export interface SourceAdapter<P> {
  name: SourceName;
  load(params: P): Promise<RawLead[]>;
}

export const SOURCE_LABELS: Record<SourceName, string> = {
  osm: 'OpenStreetMap',
  csv: 'CSV import',
  seed: 'Seed list',
};
