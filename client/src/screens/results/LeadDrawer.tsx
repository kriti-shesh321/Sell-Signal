import { useEffect, useRef } from 'react'
import { Filled } from '../../components/Filled'
import { SitePill } from '../../components/SitePill'
import { TierBadge } from '../../components/TierBadge'
import { formatPhone } from '../../lib/format'
import type { Lead } from '../../types'
import { describeSource, isAiSource, place } from '../../lib/leads'
import { AiTag } from '../../components/AiTag'

const TIER_TEXT = { A: 'Tier A · Call first', B: 'Tier B · Nurture', C: 'Tier C · Low priority' } as const
const SOURCE_NAMES: Record<string, string> = { osm: 'OpenStreetMap', csv: 'CSV import', seed: 'Seed list' }

/** Right-hand panel with the full score evidence for one lead. Escape or the overlay closes it. */
export function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus()
    }
  }, [onClose])

  const notAFit = lead.reasons.some((r) => r.key === 'franchise' || r.key === 'nonprofit')
  const v = lead.validation
  const sources = lead.source.split('+').map((s) => SOURCE_NAMES[s] ?? s)

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-[rgba(3,7,18,.55)] backdrop-blur-[2px]" aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed inset-y-0 right-0 z-41 flex w-[min(500px,100vw)] flex-col overflow-y-auto border-l border-line2 bg-panel shadow-panel"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3.5 border-b border-line bg-panel px-6 py-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="drawer-title" className="text-[19px] leading-snug font-semibold">
              {lead.company ?? lead.domain ?? 'Unnamed business'}
            </h2>
            <div className="text-[13px] text-tx3">
              {place(lead)}
              {lead.yearsInBusiness !== null && ` · ${lead.yearsInBusiness} yrs in business`}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-line2 bg-panel2 text-base text-tx2 hover:text-tx"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-4">
            {lead.tier && <TierBadge tier={lead.tier} size={52} />}
            <div className="flex flex-col gap-0.5">
              <div className="font-mono text-4xl leading-none font-semibold">
                {lead.score ?? '—'}
                <span className="text-base text-tx3"> / 100</span>
              </div>
              <div className="text-[13px] text-tx3">
                {lead.tier ? TIER_TEXT[lead.tier] : 'Not scored yet'}
                {notAFit && ' (capped at tier C: franchise/PE-owned or nonprofit)'}
              </div>
            </div>
          </div>

          {lead.whyCall && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-panel2 px-4 py-3.5">
              <div className="eyebrow">Why call</div>
              <div className="text-[15px] leading-relaxed">{lead.whyCall}</div>
            </div>
          )}

          <section className="flex flex-col">
            <h3 className="mb-2 text-[13px] font-semibold text-tx2">Score breakdown</h3>
            {lead.reasons.length === 0 && <div className="border-t border-line py-3 text-sm text-tx3">No signals found.</div>}
            {lead.reasons.map((r) => (
              <div key={r.key} className="flex gap-3.5 border-t border-line py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {r.label}
                    {isAiSource(r.source) && <AiTag />}
                  </div>
                  <div className="text-[13px] leading-snug break-words text-tx2">{r.evidence}</div>
                  <div className="text-xs text-tx3">Source: {r.source}</div>
                </div>
                <div className={`font-mono text-base font-semibold ${r.points < 0 ? 'text-bad' : r.points === 0 ? 'text-tx3' : 'text-tier-a'}`}>
                  {r.points > 0 ? '+' : ''}
                  {r.points}
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-line2 py-3 text-sm font-semibold">
              <span>Total (0–100)</span>
              <span className="font-mono">{lead.score ?? '—'}</span>
            </div>
          </section>

          <section className="flex flex-col gap-2.5 text-sm">
            <h3 className="text-[13px] font-semibold text-tx2">Contact</h3>
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2">
              <dt className="text-tx3">{lead.ownerRole === 'founder' ? 'Founder' : 'Owner'}</dt>
              <dd>{lead.ownerName ? <Filled lead={lead} field="ownerName">{lead.ownerName}</Filled> : <span className="text-tx3">Not found: ask for the owner</span>}</dd>
              <dt className="text-tx3">Phone</dt>
              <dd>
                {lead.phone ? (
                  <>
                    <Filled lead={lead} field="phone" mono>
                      {formatPhone(lead.phone)}
                    </Filled>{' '}
                    <span className="text-xs text-tx3">{v?.phoneValid ? '✓ valid US number' : '✗ not a valid US number'}</span>
                  </>
                ) : (
                  <span className="text-tx3">Not found</span>
                )}
              </dd>
              <dt className="text-tx3">Email</dt>
              <dd className="break-all">
                {lead.email ? (
                  <>
                    <Filled lead={lead} field="email">
                      {lead.email}
                    </Filled>{' '}
                    <span className="text-xs break-normal text-tx3">{v?.emailDomainAcceptsMail ? '✓ domain accepts email' : "✗ domain doesn't accept email"}</span>
                  </>
                ) : (
                  <span className="text-tx3">Not found</span>
                )}
              </dd>
              <dt className="text-tx3">Website</dt>
              <dd className="flex flex-col items-start gap-1">
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="break-all text-acc hover:underline">
                    {lead.domain}
                  </a>
                ) : (
                  <span className="text-tx3">None listed</span>
                )}
                <SitePill status={lead.siteStatus} />
              </dd>
              <dt className="text-tx3">Address</dt>
              <dd>{[lead.street, place(lead)].filter((x) => x && x !== '—').join(', ') || <span className="text-tx3">Not found</span>}</dd>
              <dt className="text-tx3">Size</dt>
              <dd className="text-tx3">Not estimated (revenue and headcount are out of scope)</dd>
            </dl>
          </section>

          <section className="flex flex-col gap-2 text-[13px] text-tx2">
            <h3 className="font-semibold">Data sources</h3>
            <div>
              From {sources.join(' + ')}
              {lead.completeness.before !== null && ` · completeness ${lead.completeness.before}% → ${lead.completeness.after ?? lead.completeness.before}%`}
            </div>
            {lead.mergedFrom.length > 0 && (
              <ul className="list-disc pl-5 text-tx3">
                {lead.mergedFrom.map((m, i) => (
                  <li key={i}>
                    Merged {SOURCE_NAMES[m.source] ?? m.source} row “{m.company ?? m.domain}” (same {m.matchedOn.join(' + ')})
                  </li>
                ))}
              </ul>
            )}
            {lead.filled.length > 0 && (
              <ul className="flex flex-col gap-1 text-tx3">
                {lead.filled.map((f) => (
                  <li key={f}>
                    <span className="text-tx2">{f}</span> filled from {describeSource(lead.fieldSources[f])}
                    {isAiSource(lead.fieldSources[f]?.source) && (
                      <>
                        {' '}
                        <AiTag />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {lead.phone && v?.phoneValid && (
            <a href={`tel:+1${lead.phone}`} className="btn-primary h-[50px] w-full text-[15px]">
              Call {lead.ownerName && lead.ownerRole !== 'founder' ? lead.ownerName.split(' ')[0] : lead.company} · {formatPhone(lead.phone)}
            </a>
          )}
        </div>
      </aside>
    </>
  )
}
