import { Alert } from '../components/Alert'
import { formatDuration } from '../lib/format'
import { overallPct, runLabel } from '../lib/run'
import type { Meta, RunView, Stage } from '../types'

const STEPS: Array<{ stage: Stage; label: string }> = [
  { stage: 'reading', label: 'Reading rows' },
  { stage: 'merging', label: 'Merging duplicates' },
  { stage: 'enriching', label: 'Reading websites and filling missing fields' },
  { stage: 'scoring', label: 'Scoring readiness' },
]
const ORDER: Stage[] = ['queued', 'reading', 'merging', 'enriching', 'scoring', 'done']

interface Props {
  run: RunView | null
  loadError: string | null
  meta: Meta | null
  canRetry: boolean
  onRetry: () => void
  onCancel: () => void
  onViewResults: () => void
  onStartOver: () => void
}

export function Processing({ run, loadError, meta, canRetry, onRetry, onCancel, onViewResults, onStartOver }: Props) {
  const { eyebrow, title } = runLabel(run, meta)
  const failed = run?.status === 'failed'
  const pct = run ? overallPct(run) : 0
  const current = run ? ORDER.indexOf(run.progress.stage) : 0
  const s = run?.stats
  const rowsRead = s ? Object.values(s.rowsIn).reduce((a, b) => a + (b ?? 0), 0) : 0
  const activeStep = STEPS.find((st) => ORDER.indexOf(st.stage) >= current) ?? STEPS[STEPS.length - 1]!
  const processed = run?.progress.processed ?? 0
  const total = run?.progress.total ?? 0

  const blocked = s?.sites.blocked ?? 0
  const unreachable = (s?.sites.unreachable ?? 0) + (s?.sites.robotsDisallowed ?? 0)
  const counters = [
    { label: 'Rows read', value: rowsRead, color: 'text-tx', detail: '' },
    { label: 'Duplicates merged', value: s?.duplicatesMerged ?? 0, color: 'text-tx', detail: '' },
    { label: 'Fields filled', value: s?.fieldsFilled ?? 0, color: 'text-acc', detail: '' },
    { label: 'Site issues', detail: `${blocked} blocked · ${unreachable} unreachable`, value: blocked + unreachable, color: 'text-warn' },
  ]

  if (loadError && !run) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 pt-[clamp(8px,5vh,56px)]">
        <Alert title="Couldn't load this run">{loadError}</Alert>
        <button type="button" onClick={onStartOver} className="self-start text-sm font-semibold text-acc hover:underline">
          Start a new search
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 pt-[clamp(8px,5vh,56px)]">
      <div className="flex flex-col gap-2.5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-[clamp(26px,3.4vw,36px)] leading-[1.15] font-semibold tracking-[-0.02em]">
          {failed ? 'The run stopped' : title}
        </h1>
      </div>

      {run?.notice && <Alert tone="warn">{run.notice}</Alert>}

      <div className="flex flex-col gap-6 rounded-2xl border border-line bg-panel p-[clamp(20px,3vw,28px)] shadow-panel">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <div aria-live="polite" className="text-[15px] font-medium text-tx2">
              {failed ? `Stopped at: ${activeStep.label.toLowerCase()}` : run?.status === 'done' ? 'Done' : `${activeStep.label}…`}
            </div>
            <div className="font-mono text-[22px] font-semibold">{pct}%</div>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Run progress"
            className="h-2.5 overflow-hidden rounded-full bg-panel3"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: failed ? 'var(--bad)' : 'linear-gradient(90deg,#36d6c3,#4f8df7)' }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 font-mono text-xs text-tx3">
            <span>{total ? `${processed} of ${total} businesses` : run ? 'Preparing…' : ''}</span>
            {s && s.timings.elapsedMs > 0 && (
              <span>
                {formatDuration(s.timings.elapsedMs)} elapsed{s.timings.avgSiteMs ? ` · ~${(s.timings.avgSiteMs / 1000).toFixed(1)}s per website` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          {counters.map((c) => (
            <div key={c.label} className="flex flex-col gap-1 rounded-xl border border-line bg-panel2 px-4 py-3.5">
              <div className={`font-mono text-[26px] font-semibold ${c.color}`}>{c.value}</div>
              <div className="text-[13px] text-tx3">{c.label}</div>
              {c.detail && <div className="font-mono text-[11px] text-tx3">{c.detail}</div>}
            </div>
          ))}
        </div>

        <ol className="flex flex-col gap-3">
          {STEPS.map((st) => {
            const idx = ORDER.indexOf(st.stage)
            const done = run?.status === 'done' || idx < current
            const active = !done && idx === current
            const fail = failed && active
            return (
              <li key={st.stage} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold ${
                    done
                      ? 'border-transparent bg-tier-a-bg text-tier-a'
                      : fail
                        ? 'border-transparent bg-bad text-white'
                        : active
                          ? 'border-acc'
                          : 'border-transparent bg-panel3'
                  }`}
                >
                  {done ? '✓' : fail ? '!' : ''}
                </span>
                <span className={done ? 'text-tx2' : active ? 'font-semibold text-tx' : 'text-tx3'}>
                  {st.label}
                  <span className="sr-only">{done ? ' (done)' : active ? ' (in progress)' : ' (pending)'}</span>
                </span>
              </li>
            )
          })}
        </ol>

        {failed && (
          <div className="flex flex-col gap-3.5 rounded-xl border border-bad-ln bg-bad-bg px-[18px] py-4">
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full bg-bad text-[13px] font-bold text-white">
                !
              </span>
              <div className="flex flex-col gap-1">
                <div className="text-[15px] font-semibold">{run?.error ?? 'The run failed.'}</div>
                {processed > 0 && (
                  <div className="text-sm leading-relaxed text-tx2">{processed} businesses were already scored and saved.</div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5 pl-[34px]">
              <button type="button" onClick={canRetry ? onRetry : onStartOver} className="btn-primary h-[42px] px-[18px] text-sm">
                {canRetry ? 'Retry' : 'Start again'}
              </button>
              {processed > 0 && (
                <button
                  type="button"
                  onClick={onViewResults}
                  className="h-[42px] rounded-[10px] border border-line2 bg-panel px-4 text-sm font-medium text-tx hover:border-tx3"
                >
                  View {processed} partial results
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!failed && (
        <button type="button" onClick={onCancel} className="self-center text-sm text-tx3 hover:text-tx">
          Cancel
        </button>
      )}
    </div>
  )
}
