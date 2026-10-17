import { isAiSource } from '../lib/leads'
import type { Reason, Tier } from '../types'
import { AiTag } from './AiTag'

const POS: Record<Tier, string> = { A: 'text-tier-a', B: 'text-tier-b', C: 'text-tier-c' }

export function ReasonChip({ reason, tier }: { reason: Reason; tier: Tier | null }) {
  const negative = reason.points < 0
  return (
    <span
      title={`${reason.evidence} · Source: ${reason.source}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel2 px-2.5 py-1 text-xs text-tx2"
    >
      {reason.label}
      {isAiSource(reason.source) && <AiTag />}
      <b className={`font-mono ${negative ? 'text-bad' : POS[tier ?? 'C']}`}>
        {reason.points > 0 ? '+' : ''}
        {reason.points}
      </b>
    </span>
  )
}
