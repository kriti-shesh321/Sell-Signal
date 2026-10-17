import type { Meta, RunView } from '../types'
import { plural } from '../lib/format'
import { runLabel } from '../lib/run'

/** Temporary results summary until the full results screen lands. */
export function ResultsPlaceholder({ run, meta, onNewSearch }: { run: RunView | null; meta: Meta | null; onNewSearch: () => void }) {
  const { eyebrow } = runLabel(run, meta)
  const s = run?.stats
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="text-[clamp(26px,3.4vw,36px)] font-semibold tracking-[-0.02em]">
            {s ? `${s.unique} businesses, ranked by readiness to sell` : 'Loading results…'}
          </h1>
        </div>
        <button type="button" onClick={onNewSearch} className="h-11 rounded-[10px] border border-line2 bg-panel px-4 text-sm font-medium hover:border-tx3">
          New search
        </button>
      </div>
      {s && (
        <div className="rounded-2xl border border-line bg-panel p-6 font-mono text-sm text-tx2">
          A {s.tiers.A} · B {s.tiers.B} · C {s.tiers.C} · completeness {s.completeness.before}% → {s.completeness.after}% ·{' '}
          {plural(s.duplicatesMerged, 'duplicate')} merged
        </div>
      )}
    </div>
  )
}
