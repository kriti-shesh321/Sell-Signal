import { StatePicker } from '../../components/StatePicker'
import { hasAnyFilter, type Filters } from '../../lib/filters'
import type { Tier } from '../../types'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  counts: Record<Tier, number>
  total: number
  shown: number
  states: string[]
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-[38px] items-center gap-2 rounded-[9px] border px-3 text-sm transition ${
        on ? 'border-acc bg-fill text-tx' : 'border-line2 bg-panel2 text-tx2 hover:text-tx'
      }`}
    >
      <span aria-hidden className={`grid size-4 place-items-center rounded-[4px] border text-[11px] font-bold ${on ? 'border-acc bg-acc text-[#04171b]' : 'border-line2'}`}>
        {on ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

export function FilterBar({ filters, onChange, counts, total, shown, states }: Props) {
  const tiers: Array<{ key: Filters['tier']; label: string; n: number }> = [
    { key: 'all', label: 'All', n: total },
    { key: 'A', label: 'A', n: counts.A },
    { key: 'B', label: 'B', n: counts.B },
    { key: 'C', label: 'C', n: counts.C },
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-panel px-4 py-3.5">
      <div role="group" aria-label="Tier" className="flex gap-0.5 rounded-[10px] border border-line bg-panel2 p-[3px]">
        {tiers.map((t) => {
          const on = filters.tier === t.key
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...filters, tier: t.key })}
              className={`flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm font-medium transition ${on ? 'bg-panel text-tx shadow-sm' : 'text-tx3 hover:text-tx2'}`}
            >
              {t.label}
              <span className="font-mono text-xs text-tx3">{t.n}</span>
            </button>
          )
        })}
      </div>
      <Toggle on={filters.hasPhone} label="Has phone" onClick={() => onChange({ ...filters, hasPhone: !filters.hasPhone })} />
      <Toggle on={filters.hasOwner} label="Has owner" onClick={() => onChange({ ...filters, hasOwner: !filters.hasOwner })} />
      {states.length > 1 && (
        <div className="w-[160px]">
          <StatePicker
            label="State"
            size="sm"
            value={filters.state}
            onChange={(state) => onChange({ ...filters, state })}
            allOption={{ value: '', label: 'All states' }}
            options={states.map((s) => ({ value: s, label: s }))}
          />
        </div>
      )}
      <div className="flex-1" />
      {hasAnyFilter(filters) && (
        <button type="button" onClick={() => onChange({ tier: 'all', hasPhone: false, hasOwner: false, state: '' })} className="text-sm text-acc hover:underline">
          Clear filters
        </button>
      )}
      <div className="text-sm text-tx3" aria-live="polite">
        Showing <b className="text-tx">{shown}</b> of {total}
      </div>
    </div>
  )
}
