import type { Tier } from '../types'

export interface Filters {
  tier: Tier | 'all'
  hasPhone: boolean
  hasOwner: boolean
  state: string
}

export const NO_FILTERS: Filters = { tier: 'all', hasPhone: false, hasOwner: false, state: '' }

export const hasAnyFilter = (f: Filters) => f.tier !== 'all' || f.hasPhone || f.hasOwner || f.state !== ''

/** Filters as the API's query params (the list and the exports take the same ones). */
export function toApiQuery(f: Filters): URLSearchParams {
  const q = new URLSearchParams()
  if (f.tier !== 'all') q.set('tier', f.tier)
  if (f.hasPhone) q.set('hasPhone', 'true')
  if (f.hasOwner) q.set('hasOwner', 'true')
  if (f.state) q.set('state', f.state)
  return q
}

/** Read filters from the page URL (?tier=A&phone=1&owner=1&state=TX). */
export function readFilters(params: URLSearchParams): Filters {
  const tier = params.get('tier')?.toUpperCase()
  return {
    tier: tier === 'A' || tier === 'B' || tier === 'C' ? tier : 'all',
    hasPhone: params.get('phone') === '1',
    hasOwner: params.get('owner') === '1',
    state: /^[A-Z]{2}$/.test(params.get('state') ?? '') ? params.get('state')! : '',
  }
}

export function writeFilters(params: URLSearchParams, f: Filters) {
  for (const k of ['tier', 'phone', 'owner', 'state']) params.delete(k)
  if (f.tier !== 'all') params.set('tier', f.tier)
  if (f.hasPhone) params.set('phone', '1')
  if (f.hasOwner) params.set('owner', '1')
  if (f.state) params.set('state', f.state)
}
