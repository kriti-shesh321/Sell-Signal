import { discover, importCsv, importSample } from '../api'
import type { Meta, RunView, StartedRun, TradeKey } from '../types'

/** Trade name inside a sentence: "HVAC" stays, "Roofing" → "roofing". */
export const tradeWord = (label: string) => (label === 'HVAC' ? label : label.toLowerCase())

export type StartRequest = { kind: 'discover'; trade: TradeKey; state: string } | { kind: 'import'; file: File } | { kind: 'sample' }

/** Sends a start request to the API (also used by Retry on the processing screen). */
export function submitStart(req: StartRequest): Promise<StartedRun> {
  if (req.kind === 'discover') return discover(req.trade, req.state)
  if (req.kind === 'import') return importCsv(req.file)
  return importSample()
}

/** One progress number for the whole run: loading and merging are quick, websites take most of the time. */
export function overallPct(run: RunView): number {
  const { stage, processed, total } = run.progress
  if (stage === 'done' || run.status === 'done') return 100
  if (stage === 'enriching' || stage === 'scoring') return Math.min(99, 10 + Math.round((total ? processed / total : 1) * 89))
  return stage === 'merging' ? 6 : stage === 'reading' ? 3 : 0
}

export function runLabel(run: RunView | null, meta: Meta | null): { eyebrow: string; title: string } {
  if (!run) return { eyebrow: 'Loading', title: 'Getting your run…' }
  const p = run.params
  if (p.trade && p.state) {
    const trade = meta?.trades.find((t) => t.key === p.trade)?.label ?? p.trade
    const state = meta?.states.find((s) => s.code === p.state)?.name ?? p.state
    return { eyebrow: `${trade} · ${state}`, title: `Finding ${tradeWord(trade)} businesses in ${state}` }
  }
  return { eyebrow: p.fileName ?? 'CSV import', title: 'Cleaning and scoring your list' }
}

export const isFinished = (run: RunView | null) => run?.status === 'done' || run?.status === 'cancelled'
