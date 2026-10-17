import type { Tier } from '../types'

const STYLE: Record<Tier, string> = {
  A: 'text-tier-a bg-tier-a-bg border-tier-a-ln',
  B: 'text-tier-b bg-tier-b-bg border-tier-b-ln',
  C: 'text-tier-c bg-tier-c-bg border-tier-c-ln',
}

export function TierBadge({ tier, size = 30 }: { tier: Tier; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg border font-mono font-semibold ${STYLE[tier]}`}
      style={{ width: size, height: size, fontSize: size > 36 ? 20 : 14 }}
      aria-label={`Tier ${tier}`}
    >
      {tier}
    </span>
  )
}
