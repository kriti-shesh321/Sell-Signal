import { NO_FILTERS, readFilters, writeFilters, type Filters } from './filters'

/** The app keeps its place in the URL (?run=<id>[&view=results][&tier=A…]) so a reload or shared link resumes it. */
export interface Location {
  runId: string | null
  view: 'results' | null
  filters: Filters
  /** Start screen tab (e.g. "Import CSV instead" from an empty result). */
  tab: 'find' | 'import'
}

export function readLocation(): Location {
  const p = new URLSearchParams(window.location.search)
  return {
    runId: p.get('run'),
    view: p.get('view') === 'results' ? 'results' : null,
    filters: readFilters(p),
    tab: p.get('tab') === 'import' ? 'import' : 'find',
  }
}

export function writeLocation(loc: Location, replace = false) {
  const p = new URLSearchParams()
  if (loc.runId) {
    p.set('run', loc.runId)
    if (loc.view) p.set('view', loc.view)
    writeFilters(p, loc.filters)
  } else if (loc.tab === 'import') {
    p.set('tab', 'import')
  }
  const url = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
}

export const startLocation = (tab: Location['tab'] = 'find'): Location => ({ runId: null, view: null, filters: NO_FILTERS, tab })
