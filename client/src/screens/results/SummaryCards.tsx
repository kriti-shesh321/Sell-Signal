import { plural } from '../../lib/format'
import type { RunStats } from '../../types'

const SOURCE_NAMES: Record<string, string> = { osm: 'OpenStreetMap', csv: 'CSV', seed: 'seed list' }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-line bg-panel px-3.5 py-3.5 sm:px-5 sm:py-[18px]">
      <div className="text-[13px] font-medium text-tx3">{title}</div>
      {children}
    </div>
  )
}

const big = 'font-mono text-[21px] font-semibold tracking-[-0.02em] sm:text-[28px]'

export function SummaryCards({ stats }: { stats: RunStats }) {
  const rowsIn = Object.values(stats.rowsIn).reduce((a, b) => a + (b ?? 0), 0)
  const sources = Object.entries(stats.rowsIn).map(([k, v]) => `${v} ${SOURCE_NAMES[k] ?? k}`)
  const { A, B, C } = stats.tiers
  const scored = A + B + C || 1
  const issues = stats.sites.blocked + stats.sites.unreachable + stats.sites.robotsDisallowed
  const { before, after } = stats.completeness

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
      <Card title="Rows in → unique">
        <div className={big}>
          {rowsIn} <span className="text-tx3">→</span> {stats.unique}
        </div>
        <div className="text-[13px] text-tx2">
          {plural(stats.duplicatesMerged, 'duplicate')} merged
          {stats.crossSourceDuplicates > 0 && ` (${stats.crossSourceDuplicates} across sources)`}
          {sources.length > 1 && <span className="block text-tx3">{sources.join(' + ')}</span>}
        </div>
      </Card>
      <Card title="Field completeness">
        <div className={big}>
          <span className="text-tx3">{before}%</span> → {after}%
        </div>
        <div
          className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-panel3"
          role="img"
          aria-label={`Completeness went from ${before}% to ${after}%`}
        >
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${after}%`, background: 'linear-gradient(90deg,#36d6c3,#4f8df7)' }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-tx3" style={{ width: `${before}%` }} />
        </div>
        <div className="text-[13px] text-tx2">{plural(stats.fieldsFilled, 'field')} filled from company websites</div>
      </Card>
      <Card title="Tier breakdown">
        <div className="flex items-baseline gap-3 sm:gap-[18px]">
          {(['A', 'B', 'C'] as const).map((t) => (
            <div key={t} className={`${big} ${t === 'A' ? 'text-tier-a' : t === 'B' ? 'text-tier-b' : 'text-tier-c'}`}>
              {stats.tiers[t]}
              <span className="ml-1 text-[13px]">{t}</span>
            </div>
          ))}
        </div>
        <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={`${A} A, ${B} B, ${C} C`}>
          {A > 0 && <div className="bg-tier-a" style={{ flex: A / scored }} />}
          {B > 0 && <div className="bg-tier-b" style={{ flex: B / scored }} />}
          {C > 0 && <div className="bg-tier-c" style={{ flex: C / scored }} />}
        </div>
      </Card>
      <Card title="Website issues">
        <div className={`${big} text-warn`}>{issues}</div>
        <div className="text-[13px] leading-snug text-tx2">
          {stats.sites.blocked} blocked · {stats.sites.unreachable} unreachable
          {stats.sites.robotsDisallowed > 0 && ` · ${stats.sites.robotsDisallowed} robots.txt`}
          {issues > 0 && <span className="block text-tx3">Scored from listing data only</span>}
        </div>
      </Card>
    </div>
  )
}
