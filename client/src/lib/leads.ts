import type { KeyboardEvent } from 'react'
import type { Lead } from '../types'

export const place = (l: Lead) => [l.city, l.state].filter(Boolean).join(', ') || '—'

/** Values suggested by the optional AI fallback carry a source like "AI (model) from website:/about". */
export const isAiSource = (source: string | undefined) => Boolean(source?.startsWith('AI '))

export const describeSource = (s: { source: string; method?: string; evidence?: string } | undefined) =>
  s ? `${s.source}${s.method ? ` (${s.method})` : ''}${s.evidence ? `: ${s.evidence}` : ''}` : 'unknown source'

/** Enter / Space on a clickable row or card opens it, like a button. */
export const openOnKey = (open: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open()
  }
}
