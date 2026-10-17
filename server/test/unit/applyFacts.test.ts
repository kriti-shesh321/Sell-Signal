import { describe, expect, it } from 'vitest';
import type { SiteFacts } from '../../src/enrich/extract/index.js';
import { applySiteFacts } from '../../src/pipeline/applyFacts.js';
import type { MergedLead } from '../../src/types.js';

const lead = (over: Partial<MergedLead> = {}): MergedLead => ({
  company: 'Smith Plumbing', domain: 'smith.com', website: 'https://smith.com/', phone: '2145550101', email: null,
  street: null, city: 'Dallas', state: 'TX', industry: 'plumbing', yearFounded: null, ownerName: null, ownerRole: null,
  source: 'osm', sources: ['osm'], raw: [], fieldSources: { phone: { source: 'OpenStreetMap' }, city: { source: 'OpenStreetMap' } }, mergedFrom: [],
  ...over,
});

const at = (source: string) => ({ source, method: 'text' as const });
const facts: SiteFacts = {
  yearFounded: { value: 1985, evidence: 'since 1985', ...at('website:/about') },
  ownerName: null,
  phone: { value: '2145559999', evidence: 'tel:', ...at('website:/') },
  email: { value: 'office@smith.com', evidence: 'mailto:', ...at('website:/contact') },
  address: { value: { street: '12 Elm St', city: 'Plano', state: 'TX', postalCode: '75001' }, evidence: '12 Elm St', source: 'website:/', method: 'JSON-LD' },
  signals: { familyOwned: null, franchise: null, nonprofit: null, copyrightYear: null, hasViewport: true, https: true },
};

describe('applySiteFacts', () => {
  it('fills only empty fields and never overwrites source data', () => {
    const out = applySiteFacts(lead(), { status: 'ok', facts });
    expect(out).toMatchObject({ phone: '2145550101', city: 'Dallas', yearFounded: 1985, email: 'office@smith.com', street: '12 Elm St' });
    expect(out.filled.sort()).toEqual(['email', 'street', 'yearFounded']);
    expect(out.fieldSources.yearFounded).toEqual({ source: 'website:/about', method: 'text', evidence: 'since 1985' });
    expect(out.fieldSources.phone).toEqual({ source: 'OpenStreetMap' });
  });

  it('carries the owner/founder role with a filled name', () => {
    const named: SiteFacts = { ...facts, ownerName: { value: 'Randy Bellomy', role: 'founder', evidence: 'founder Randy Bellomy', ...at('website:/about') } };
    expect(applySiteFacts(lead(), { status: 'ok', facts: named })).toMatchObject({ ownerName: 'Randy Bellomy', ownerRole: 'founder' });
    // an owner already known from the source keeps its role
    expect(applySiteFacts(lead({ ownerName: 'Jane Doe', ownerRole: 'owner' }), { status: 'ok', facts: named })).toMatchObject({ ownerName: 'Jane Doe', ownerRole: 'owner' });
  });

  it('records site status and signals; no website → no_website', () => {
    expect(applySiteFacts(lead(), { status: 'ok', facts }).signals?.https).toBe(true);
    expect(applySiteFacts(lead(), { status: 'blocked', facts: null })).toMatchObject({ siteStatus: 'blocked', signals: null, filled: [] });
    expect(applySiteFacts(lead({ domain: null }), null).siteStatus).toBe('no_website');
  });
});
