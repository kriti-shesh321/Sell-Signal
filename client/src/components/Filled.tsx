import type { ReactNode } from 'react'
import { describeSource, isAiSource } from '../lib/leads'
import type { Lead } from '../types'
import { AiTag } from './AiTag'

/**
 * A value SellSignal filled in (it was missing in the source data): highlighted, with its source on
 * hover or keyboard focus. Values that came with the source data render plainly.
 */
export function Filled({ lead, field, children, mono }: { lead: Lead; field: string; children: ReactNode; mono?: boolean }) {
  if (!lead.filled.includes(field)) return <span className={mono ? 'font-mono' : undefined}>{children}</span>
  const src = lead.fieldSources[field]
  return (
    <span className="group relative inline-flex max-w-full">
      <span
        tabIndex={0}
        aria-label={`${typeof children === 'string' ? children : ''} (filled from ${describeSource(src)})`}
        className={`truncate rounded-[5px] border-b border-dashed border-fill-ln bg-fill px-1.5 py-px text-tx ${mono ? 'font-mono' : ''}`}
      >
        {children}
      </span>
      {isAiSource(src?.source) && (
        <span className="ml-1 self-center">
          <AiTag />
        </span>
      )}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute top-full left-0 z-20 mt-1.5 w-max max-w-[300px] rounded-lg border border-line2 bg-panel3 px-3 py-2 text-xs leading-snug font-normal text-tx2 opacity-0 shadow-panel transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {isAiSource(src?.source) ? (
          <>
            Suggested by <b className="text-tx">{src?.source}</b>, quote checked against the page
          </>
        ) : (
          <>
            Filled from <b className="text-tx">{src?.source ?? 'website'}</b>
            {src?.method && <> ({src.method})</>}
          </>
        )}
        {src?.evidence && <span className="mt-1 block text-tx3">“{src.evidence}”</span>}
      </span>
    </span>
  )
}
