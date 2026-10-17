import { describe, expect, it } from 'vitest';
import { defaultBuyBox, scoreLead, tierFor, topReasons, type BuyBox, type ScoringInput } from '../../src/score/index.js';
import { f, modernSignals, okValidation, smithPlumbing } from '../helpers/smithPlumbing.js';

const NOW = new Date('2026-06-01T00:00:00Z');

const plumbingTx: BuyBox = { ...defaultBuyBox(['TX']), industries: ['plumbing'] };

describe('Smith Plumbing worked example', () => {
  it('scores 85 → tier A with one reason per signal', () => {
    const r = scoreLead(smithPlumbing(), plumbingTx, NOW);
    expect(r.score).toBe(85);
    expect(r.tier).toBe('A');
    expect(r.reasons.map((x) => [x.key, x.points])).toEqual([
      ['age20', 20],
      ['familyOwned', 15],
      ['industry', 15],
      ['phone', 10],
      ['emailDomain', 10],
      ['underDigitized', 10],
      ['state', 5],
    ]);
    expect(r.reasons[0]).toMatchObject({ label: 'Founded 1985 (41 yrs)', source: 'website:/about', evidence: '“Serving Dallas since 1985”' });
    expect(r.reasons.find((x) => x.key === 'emailDomain')?.label).toBe('Domain accepts email');
    expect(r.reasons.find((x) => x.key === 'underDigitized')?.evidence).toBe('© 2019');
  });
});

describe('tiers and clamping', () => {
  it.each([
    [100, 'A'],
    [70, 'A'],
    [69, 'B'],
    [45, 'B'],
    [44, 'C'],
    [0, 'C'],
  ] as const)('%i → %s', (score, tier) => {
    expect(tierFor(score)).toBe(tier);
  });

  it('clamps below 0 (franchise + nonprofit)', () => {
    const lead: ScoringInput = {
      ...smithPlumbing(),
      yearFounded: null,
      phone: null,
      email: null,
      signals: modernSignals({ franchise: f(true as const, 'a franchise'), nonprofit: f(true as const, '501(c)(3)') }),
    };
    const r = scoreLead(lead, plumbingTx, NOW);
    expect(r.reasons.reduce((s, x) => s + x.points, 0)).toBeLessThan(0);
    expect(r).toMatchObject({ score: 0, tier: 'C' });
  });

  it('clamps above 100 with custom weights', () => {
    const box = { ...plumbingTx, weights: { ...plumbingTx.weights, age20: 60 } };
    expect(scoreLead(smithPlumbing(), box, NOW).score).toBe(100);
  });

  it('has no baseline points', () => {
    const empty: ScoringInput = {
      industry: null, state: null, phone: null, email: null, yearFounded: null, ownerName: null, ownerRole: null,
      fieldSources: {}, signals: null, siteStatus: 'no_website',
      validation: { phoneValid: null, emailSyntax: null, emailDomainAcceptsMail: null, mxHost: null, stateValid: null, siteStatus: 'no_website' },
    };
    expect(scoreLead(empty, plumbingTx, NOW)).toMatchObject({ score: 0, tier: 'C', reasons: [] });
  });
});

describe('signals', () => {
  const score = (over: Partial<ScoringInput>, box = plumbingTx) => scoreLead({ ...smithPlumbing(), ...over }, box, NOW);

  it('age: 20 years → +20, 19 → +10, 9 → 0', () => {
    expect(score({ yearFounded: 2006 }).reasons.find((r) => r.key.startsWith('age'))).toMatchObject({ key: 'age20', points: 20 });
    expect(score({ yearFounded: 2007 }).reasons.find((r) => r.key.startsWith('age'))).toMatchObject({ key: 'age10', points: 10 });
    expect(score({ yearFounded: 2017 }).reasons.find((r) => r.key.startsWith('age'))).toBeUndefined();
  });

  it('franchise −30', () => {
    const r = score({ signals: modernSignals({ franchise: f(true as const, 'independently owned and operated') }) });
    expect(r.reasons.find((x) => x.key === 'franchise')?.points).toBe(-30);
  });

  it('nonprofit −40', () => {
    expect(score({ signals: modernSignals({ nonprofit: f(true as const, 'non-profit') }) }).reasons.find((x) => x.key === 'nonprofit')?.points).toBe(-40);
  });

  it('owner name +10', () => {
    const r = score({ ownerName: 'Jane Smith', ownerRole: 'owner', fieldSources: { ...smithPlumbing().fieldSources, ownerName: { source: 'website:/about' } } });
    expect(r.score).toBe(95);
    expect(r.reasons.find((x) => x.key === 'owner')).toMatchObject({ label: 'Owner: Jane Smith', points: 10, source: 'website:/about' });
  });

  it('founder name: same +10, labelled as founder', () => {
    const r = score({ ownerName: 'Randy Bellomy', ownerRole: 'founder' });
    expect(r.score).toBe(95);
    expect(r.reasons.find((x) => x.key === 'owner')).toMatchObject({ label: 'Founder: Randy Bellomy', points: 10 });
  });

  it('invalid phone and email domain without MX earn nothing', () => {
    const r = score({ validation: okValidation({ phoneValid: false, emailDomainAcceptsMail: false, mxHost: null }) });
    expect(r.score).toBe(65);
  });

  it('under-digitized: no viewport or no HTTPS also count; a modern site does not', () => {
    expect(score({ signals: modernSignals({ hasViewport: false }) }).reasons.find((x) => x.key === 'underDigitized')?.evidence).toBe('no mobile viewport');
    expect(score({ signals: modernSignals({ https: false }) }).reasons.find((x) => x.key === 'underDigitized')?.evidence).toBe('no HTTPS');
    expect(score({ signals: modernSignals() }).underDigitized).toBe(false);
    expect(score({ signals: modernSignals({ copyrightYear: f(2021, '© 2021') }) }).underDigitized).toBe(true);
    expect(score({ signals: modernSignals({ copyrightYear: f(2022, '© 2022') }) }).underDigitized).toBe(false);
  });

  it('industry and state only count when in the buy-box', () => {
    const box = { ...plumbingTx, industries: ['hvac' as const], states: ['OK'] };
    const r = score({}, box);
    expect(r.reasons.map((x) => x.key)).not.toContain('industry');
    expect(r.reasons.map((x) => x.key)).not.toContain('state');
    expect(r.score).toBe(65);
  });

  it('custom weights change the total', () => {
    const box = { ...plumbingTx, weights: { ...plumbingTx.weights, underDigitized: 0, state: 15 } };
    expect(score({}, box).score).toBe(85 - 10 + 10);
  });

  it.each([
    ['blocked', 'Website blocked automated visits'],
    ['unreachable', 'Website unreachable'],
    ['robots_disallowed', 'robots.txt disallows visiting the site'],
  ] as const)('%s site → 0-point flag reason, listed last', (siteStatus, label) => {
    const r = score({ siteStatus, signals: null });
    const flag = r.reasons.at(-1)!;
    expect(flag).toMatchObject({ key: 'siteIssue', label, points: 0 });
    expect(topReasons(r.reasons).map((x) => x.key)).not.toContain('siteIssue');
  });

  it('top reasons: 3 largest by |points|, negatives included', () => {
    const r = score({ signals: modernSignals({ franchise: f(true as const, 'franchise'), copyrightYear: f(2019, '© 2019') }) });
    expect(topReasons(r.reasons).map((x) => x.key)).toEqual(['franchise', 'age20', 'industry']);
  });
});
