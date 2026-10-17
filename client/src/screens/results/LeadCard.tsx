import { SitePill } from '../../components/SitePill'
import { TierBadge } from '../../components/TierBadge'
import { formatPhone } from '../../lib/format'
import type { Lead } from '../../types'
import { openOnKey, place } from '../../lib/leads'

/** Phone layout: one card per lead with the why-call line and a big Call button. */
export function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) {
  const phoneOk = Boolean(lead.phone && lead.validation?.phoneValid)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${lead.company ?? 'Unnamed business'}, score ${lead.score ?? 'not scored'}. Open score evidence.`}
      onClick={() => onOpen(lead)}
      onKeyDown={openOnKey(() => onOpen(lead))}
      className="flex cursor-pointer flex-col gap-3 rounded-[14px] border border-line bg-panel p-4"
    >
      <div className="flex items-start gap-3">
        {lead.tier ? <TierBadge tier={lead.tier} /> : <span className="size-[30px] rounded-lg bg-panel3" />}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="text-base leading-tight font-semibold">{lead.company ?? lead.domain ?? 'Unnamed business'}</div>
          <div className="text-[13px] text-tx3">{place(lead)}</div>
          <SitePill status={lead.siteStatus} />
        </div>
        <div className="font-mono text-[22px] font-semibold">{lead.score ?? '—'}</div>
      </div>
      {lead.whyCall && <div className="text-sm leading-normal text-tx2">{lead.whyCall}</div>}
      {lead.phone && phoneOk ? (
        <a
          href={`tel:+1${lead.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-primary h-[46px] w-full text-[15px]"
        >
          Call {formatPhone(lead.phone)}
        </a>
      ) : (
        <div className="flex h-[46px] items-center justify-center rounded-[10px] border border-dashed border-line2 text-sm text-tx3">No phone found</div>
      )}
    </div>
  )
}
