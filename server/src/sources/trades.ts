import type { Industry, TradeKey } from '../types.js';

export interface Trade {
  key: TradeKey;
  label: string;
  /** OSM tag used for discovery, verified with live Overpass counts. */
  osm: { key: string; value: string };
}

export const TRADES: readonly Trade[] = [
  { key: 'hvac', label: 'HVAC', osm: { key: 'craft', value: 'hvac' } },
  { key: 'plumbing', label: 'Plumbing', osm: { key: 'craft', value: 'plumber' } },
  { key: 'electrical', label: 'Electrical', osm: { key: 'craft', value: 'electrician' } },
  { key: 'roofing', label: 'Roofing', osm: { key: 'craft', value: 'roofer' } },
];

export const TRADE_KEYS = TRADES.map((t) => t.key);

export function getTrade(key: string): Trade | undefined {
  return TRADES.find((t) => t.key === key);
}

const OSM_CRAFT_TO_TRADE: Record<string, TradeKey> = Object.fromEntries(
  TRADES.map((t) => [t.osm.value, t.key]),
);

export function tradeFromOsmCraft(craft: unknown): TradeKey | null {
  return typeof craft === 'string' ? (OSM_CRAFT_TO_TRADE[craft] ?? null) : null;
}

// Order matters: "Plumbing, Heating & Air" is plumbing first.
const INDUSTRY_PATTERNS: Array<[TradeKey, RegExp]> = [
  ['plumbing', /plumb/i],
  ['roofing', /roof/i],
  ['electrical', /electric/i],
  ['hvac', /\bhvac\b|heating|air[ -]?condition|\bA\/?C\b|cooling|refrigerat|furnace|duct/i],
];

/** Map free-text industry (e.g. a CSV "industry" cell or a trade key) to a supported trade. */
export function classifyIndustry(text: string | null | undefined): Industry | null {
  if (!text) return null;
  const exact = TRADES.find((t) => t.key === text.toLowerCase());
  if (exact) return exact.key;
  for (const [key, re] of INDUSTRY_PATTERNS) if (re.test(text)) return key;
  return 'other';
}
