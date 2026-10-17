import { describe, expect, it } from 'vitest';
import { BuyBoxInput, DEFAULT_WEIGHTS, defaultBuyBox, updateBuyBox } from '../../src/score/index.js';

describe('buy-box', () => {
  it('defaults: all four trades, the given states, spec weights', () => {
    expect(defaultBuyBox(['TX', 'TX'])).toEqual({
      industries: ['hvac', 'plumbing', 'electrical', 'roofing'],
      states: ['TX'],
      weights: DEFAULT_WEIGHTS,
    });
  });

  it('applies a partial edit', () => {
    const next = updateBuyBox(defaultBuyBox(['TX']), BuyBoxInput.parse({ states: ['tx', 'ok'], weights: { underDigitized: 5 } }));
    expect(next.states).toEqual(['TX', 'OK']);
    expect(next.industries).toHaveLength(4);
    expect(next.weights).toMatchObject({ underDigitized: 5, age20: 20 });
  });

  it.each([
    [{ states: ['ZZ'] }],
    [{ industries: ['landscaping'] }],
    [{ weights: { age20: 101 } }],
    [{ weights: { baseline: 26 } }],
  ])('rejects %j', (input) => {
    expect(BuyBoxInput.safeParse(input).success).toBe(false);
  });
});
