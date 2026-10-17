import { TierBadge } from './TierBadge'

const TIERS = [
  { tier: 'A', range: '70–100', label: 'Call first' },
  { tier: 'B', range: '45–69', label: 'Nurture' },
  { tier: 'C', range: '0–44', label: 'Low priority' },
] as const

export function TierLegend() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      {TIERS.map((t) => (
        <div key={t.tier} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5">
          <TierBadge tier={t.tier} />
          <div>
            <div className="font-mono text-sm font-semibold">{t.range}</div>
            <div className="text-[13px] text-tx3">{t.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
