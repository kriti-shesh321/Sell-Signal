import { ReasonChip } from '../../components/ReasonChip'
import { SitePill } from '../../components/SitePill'
import { TierBadge } from '../../components/TierBadge'
import type { Lead } from '../../types'
import { openOnKey, place } from '../../lib/leads'
import { ContactCell, OwnerCell, YearsCell } from './cells'

// Column minimums sum to < 1376 px, so at 1440 px the table fits without scrolling; narrower screens scroll inside the card.
const COLS = 'grid grid-cols-[96px_minmax(200px,1.5fr)_64px_minmax(140px,1fr)_minmax(190px,1.1fr)_minmax(240px,1.7fr)_minmax(220px,1.6fr)] gap-5'
const BAR: Record<string, string> = { A: 'bg-tier-a', B: 'bg-tier-b', C: 'bg-tier-c' }

export function ScoreCell({ lead }: { lead: Lead }) {
  if (lead.score === null || !lead.tier) return <span className="text-xs text-tx3">Not scored</span>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <TierBadge tier={lead.tier} />
        <span className="font-mono text-lg font-semibold">{lead.score}</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-sm bg-panel3">
        <div className={`h-full ${BAR[lead.tier]}`} style={{ width: `${lead.score}%` }} />
      </div>
    </div>
  )
}

export function LeadTable({ leads, onOpen }: { leads: Lead[]; onOpen: (l: Lead) => void }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
      <div className="overflow-x-auto">
        <div className="min-w-[1220px]" role="table" aria-label="Ranked leads">
          <div role="row" className={`${COLS} border-b border-line bg-panel2 px-5 py-3 text-xs font-semibold tracking-[0.04em] text-tx3 uppercase`}>
            {['Score ↓', 'Company', 'Years', 'Owner', 'Contact', 'Top reasons', 'Why call'].map((h) => (
              <div key={h} role="columnheader">
                {h}
              </div>
            ))}
          </div>
          {leads.map((l) => (
            <div
              key={l.id}
              role="row"
              tabIndex={0}
              aria-label={`${l.company ?? 'Unnamed business'}, score ${l.score ?? 'not scored'}. Open score evidence.`}
              onClick={() => onOpen(l)}
              onKeyDown={openOnKey(() => onOpen(l))}
              className={`${COLS} cursor-pointer border-b border-line px-5 py-4 transition last:border-b-0 hover:bg-panel2`}
            >
              <div role="cell">
                <ScoreCell lead={l} />
              </div>
              <div role="cell" className="flex min-w-0 flex-col gap-1">
                <div className="text-[15px] leading-snug font-semibold">{l.company ?? l.domain ?? 'Unnamed business'}</div>
                <div className="text-[13px] text-tx3">{place(l)}</div>
                <SitePill status={l.siteStatus} />
              </div>
              <div role="cell" className="font-mono text-[15px]">
                <YearsCell lead={l} />
              </div>
              <div role="cell" className="text-sm leading-snug">
                <OwnerCell lead={l} />
              </div>
              <div role="cell" className="min-w-0">
                <ContactCell lead={l} />
              </div>
              <div role="cell" className="flex flex-wrap content-start gap-1.5">
                {l.topReasons.map((r) => (
                  <ReasonChip key={r.key} reason={r} tier={l.tier} />
                ))}
              </div>
              <div role="cell" className="text-sm leading-normal text-pretty text-tx2">
                {l.whyCall}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
