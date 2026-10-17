import type { KeyboardEvent } from 'react'
import type { Lead } from '../types'

export const place = (l: Lead) => [l.city, l.state].filter(Boolean).join(', ') || '—'

export const describeSource = (s: { source: string; method?: string; evidence?: string } | undefined) =>
  s ? `${s.source}${s.method ? ` (${s.method})` : ''}${s.evidence ? `: ${s.evidence}` : ''}` : 'unknown source'

/** Enter / Space on a clickable row or card opens it, like a button. */
export const openOnKey = (open: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open()
  }
}
