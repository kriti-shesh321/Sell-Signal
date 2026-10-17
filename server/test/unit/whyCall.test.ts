import { describe, expect, it } from 'vitest';
import { defaultBuyBox, scoreLead, shortName, whyCall } from '../../src/score/index.js';
import { smithPlumbing } from '../helpers/smithPlumbing.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const base = { yearFounded: null, ownerName: null, ownerRole: null, state: 'TX', industry: 'plumbing' as const, familyOwned: false, franchise: false, nonprofit: false };

describe('whyCall', () => {
  it('Smith Plumbing: the expected line', () => {
    const lead = smithPlumbing();
    const r = scoreLead(lead, { ...defaultBuyBox(['TX']), industries: ['plumbing'] }, NOW);
    const line = whyCall({ ...base, yearFounded: 1985, familyOwned: true }, r);
    expect(line).toBe(
      'Family-owned since 1985 (41 yrs) · TX plumbing · dated website → succession + modernization angle. Owner not listed: ask for the owner.',
    );
  });

  it('owner known, not family-owned, modern site', () => {
    expect(whyCall({ ...base, yearFounded: 1987, ownerName: 'Jerry David', ownerRole: 'owner', industry: 'hvac' }, { yearsInBusiness: 39, underDigitized: false })).toBe(
      'Est. 1987 (39 yrs) · owner J. David · TX HVAC → succession angle.',
    );
  });

  it('young company with no angle still says why', () => {
    expect(whyCall({ ...base, yearFounded: 2016, ownerName: 'Kyle Bacon', ownerRole: 'owner' }, { yearsInBusiness: 10, underDigitized: false })).toBe(
      'Est. 2016 (10 yrs) · owner K. Bacon · TX plumbing.',
    );
  });

  it('founder: "founded by … : ask for the current owner", no generic owner note', () => {
    const line = whyCall({ ...base, yearFounded: 1947, ownerName: 'George F. Saliba', ownerRole: 'founder' }, { yearsInBusiness: 79, underDigitized: false });
    expect(line).toBe('Est. 1947 (79 yrs) · founded by G. Saliba (1947): ask for the current owner · TX plumbing → succession angle.');
    expect(line).not.toMatch(/Owner not listed/);
  });

  it('founder without a known year', () => {
    expect(whyCall({ ...base, ownerName: 'Randy Bellomy', ownerRole: 'founder' }, { yearsInBusiness: null, underDigitized: false })).toBe(
      'founded by R. Bellomy: ask for the current owner · TX plumbing.',
    );
  });

  it('negative signals say it is likely not a fit', () => {
    expect(whyCall({ ...base, yearFounded: 1980, franchise: true }, { yearsInBusiness: 46, underDigitized: false })).toBe(
      'Likely not a fit: franchise/PE-owned.',
    );
    expect(whyCall({ ...base, nonprofit: true }, { yearsInBusiness: null, underDigitized: false })).toBe('Likely not a fit: nonprofit/public.');
  });

  it('a brand-list franchise also reads "likely not a fit"', async () => {
    const { scoreEnriched } = await import('../../src/score/index.js');
    const lead = { ...smithPlumbing(), company: 'Benjamin Franklin Plumbing & Drain Services of Duncanville' };
    const r = scoreEnriched(lead, lead.validation, defaultBuyBox(['TX']), NOW);
    expect(r).toMatchObject({ tier: 'C', whyCall: 'Likely not a fit: franchise/PE-owned.' });
  });

  it('no signals → limited info', () => {
    expect(whyCall(base, { yearsInBusiness: null, underDigitized: false })).toBe('Limited public info: verify basics on the call.');
  });

  it('shortName', () => {
    expect(shortName('George F. Saliba')).toBe('G. Saliba');
    expect(shortName('Cher')).toBe('Cher');
  });
});
