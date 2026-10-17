import { z } from 'zod';
import { TRADE_KEYS } from '../sources/trades.js';
import { isStateCode } from '../sources/states.js';
import type { TradeKey } from '../types.js';

/** Default points per signal: spec §6. No baseline points. */
export const DEFAULT_WEIGHTS = {
  age20: 20,
  age10: 10,
  familyOwned: 15,
  industry: 15,
  owner: 10,
  phone: 10,
  emailDomain: 10,
  underDigitized: 10,
  state: 5,
  franchise: -30,
  nonprofit: -40,
} as const;

export type WeightKey = keyof typeof DEFAULT_WEIGHTS;
export type Weights = Record<WeightKey, number>;

export interface BuyBox {
  industries: TradeKey[];
  states: string[];
  weights: Weights;
}

const weight = z.number().int().min(-100).max(100);

export const BuyBoxInput = z.object({
  industries: z.array(z.enum(TRADE_KEYS as [TradeKey, ...TradeKey[]])).optional(),
  states: z
    .array(z.string().transform((s) => s.trim().toUpperCase()))
    .refine((xs) => xs.every(isStateCode), { message: 'states must be US state codes' })
    .optional(),
  weights: z.object(Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, weight.optional()])) as Record<WeightKey, z.ZodOptional<typeof weight>>).strict().optional(),
});
export type BuyBoxInput = z.infer<typeof BuyBoxInput>;

/** Industries = every supported trade; states = the searched state(s). */
export function defaultBuyBox(states: string[]): BuyBox {
  return { industries: [...TRADE_KEYS], states: [...new Set(states)], weights: { ...DEFAULT_WEIGHTS } };
}

/** Apply a partial edit (PUT /buybox) to an existing buy-box. */
export function updateBuyBox(current: BuyBox, input: BuyBoxInput): BuyBox {
  const weights = { ...current.weights };
  for (const [k, v] of Object.entries(input.weights ?? {})) if (v !== undefined) weights[k as WeightKey] = v;
  return {
    industries: input.industries ?? current.industries,
    states: input.states ? [...new Set(input.states)] : current.states,
    weights,
  };
}
