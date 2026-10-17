import { describe, expect, it } from 'vitest';
import { defaultBuyBox, scoreEnriched } from '../../src/score/index.js';
import { validateLead } from '../../src/validate/validate.js';
import { FIXTURE_SITES, fixtureLead, NOW } from '../helpers/fixtureLeads.js';

// OSM row from osm-test.json + facts from the saved pages; MX stubbed (any email domain accepts mail).
const scored = async (domain: string) => {
  const lead = fixtureLead(domain);
  return scoreEnriched(lead, await validateLead(lead, async () => 'mx.stub'), defaultBuyBox(['TX']), NOW);
};

describe('scores for the real fixture sites', () => {
  it.each([
    ['yell4george.com', 60, 'B', 'Est. 1947 (79 yrs) · founded by G. Saliba (1947): ask for the current owner · TX plumbing → succession angle.'],
    ['bellomyims.com', 60, 'B', 'Est. 1980 (46 yrs) · founded by R. Bellomy (1980): ask for the current owner · TX HVAC → succession angle.'],
    ['eliteaustinac.com', 75, 'A', 'Family-owned since 2013 (13 yrs) · founded by K. Bacon (2013): ask for the current owner · TX HVAC → succession angle.'],
    ['jdprecisionplumbing.com', 65, 'B', 'Family-owned since 2010 (16 yrs) · owner J. David · TX plumbing → succession angle.'],
    [
      'air-streamservices.com',
      85,
      'A',
      'Family-owned since 1974 (52 yrs) · TX HVAC · dated website → succession + modernization angle. Owner not listed: ask for the owner.',
    ],
  ])('%s → %i (%s)', async (domain, score, tier, line) => {
    const r = await scored(domain);
    expect(r).toMatchObject({ score, tier, whyCall: line });
    expect(r.reasons.every((x) => x.source && x.evidence)).toBe(true);
  });

  it('covers every fixture site', () => {
    expect(FIXTURE_SITES).toHaveLength(5);
  });
});
