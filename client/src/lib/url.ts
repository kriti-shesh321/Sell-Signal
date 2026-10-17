/** The app keeps the current run in the URL (?run=<id>[&view=results]) so a reload resumes it. */
export interface Location {
  runId: string | null
  view: 'results' | null
}

export function readLocation(): Location {
  const p = new URLSearchParams(window.location.search)
  return { runId: p.get('run'), view: p.get('view') === 'results' ? 'results' : null }
}

export function writeLocation(loc: Location) {
  const p = new URLSearchParams()
  if (loc.runId) p.set('run', loc.runId)
  if (loc.runId && loc.view) p.set('view', loc.view)
  const url = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`
  window.history.pushState(null, '', url)
}
