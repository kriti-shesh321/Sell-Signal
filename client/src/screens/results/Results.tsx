import { useEffect, useMemo, useState } from 'react'
import { ApiError, downloadExport, getLeads } from '../../api'
import { Alert } from '../../components/Alert'
import { Toast } from '../../components/Toast'
import { hasAnyFilter, NO_FILTERS, toApiQuery, type Filters } from '../../lib/filters'
import { plural } from '../../lib/format'
import { runLabel, tradeWord } from '../../lib/run'
import type { ExportFormat, Lead, LeadList, Meta, RunView } from '../../types'
import { ExportMenu } from './ExportMenu'
import { FilterBar } from './FilterBar'
import { LeadCard } from './LeadCard'
import { LeadDrawer } from './LeadDrawer'
import { LeadTable } from './LeadTable'
import { SummaryCards } from './SummaryCards'

interface Props {
  run: RunView | null
  meta: Meta | null
  filters: Filters
  onFilters: (f: Filters) => void
  onNewSearch: () => void
  onImportInstead: () => void
}

type Loaded = { key: string; list: LeadList | null; error: string | null }

export function Results({ run, meta, filters, onFilters, onNewSearch, onImportInstead }: Props) {
  const runId = run?.id ?? null
  const queryString = toApiQuery(filters).toString()
  const [all, setAll] = useState<Loaded | null>(null)
  const [shown, setShown] = useState<Loaded | null>(null)
  const [drawer, setDrawer] = useState<Lead | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'bad' } | null>(null)
  const [exporting, setExporting] = useState(false)

  // Unfiltered list once per run (state options, totals); filtered list from the API on every filter change,
  // so "Showing N" always equals what an export with the same filters contains.
  useEffect(() => {
    if (!runId) return
    const ctrl = new AbortController()
    getLeads(runId, new URLSearchParams(), ctrl.signal)
      .then((list) => setAll({ key: runId, list, error: null }))
      .catch((e: unknown) => !ctrl.signal.aborted && setAll({ key: runId, list: null, error: e instanceof ApiError ? e.message : 'Failed to load leads' }))
    return () => ctrl.abort()
  }, [runId, run?.status])

  useEffect(() => {
    if (!runId || !queryString) return
    const key = `${runId}?${queryString}`
    const ctrl = new AbortController()
    getLeads(runId, new URLSearchParams(queryString), ctrl.signal)
      .then((list) => setShown({ key, list, error: null }))
      .catch((e: unknown) => !ctrl.signal.aborted && setShown({ key, list: null, error: e instanceof ApiError ? e.message : 'Failed to load leads' }))
    return () => ctrl.abort()
  }, [runId, queryString])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const allList = all?.key === runId ? all : null
  const exact = queryString ? (shown?.key === `${runId}?${queryString}` ? shown : null) : allList
  // While a new filter loads, keep showing the previous list for this run instead of flashing "Loading".
  const previous = shown?.key.startsWith(`${runId}?`) ? shown : allList
  const current = exact ?? previous
  const loading = exact === null
  const items = current?.list?.items ?? null
  const states = useMemo(
    () => [...new Set((allList?.list?.items ?? []).map((l) => l.state).filter((s): s is string => Boolean(s)))].sort(),
    [allList],
  )

  const exportFile = async (format: ExportFormat) => {
    if (!runId) return
    setExporting(true)
    try {
      const { fileName, rows } = await downloadExport(runId, format, toApiQuery(filters))
      setToast({ msg: `Exported ${plural(rows, 'row')} · ${fileName}`, tone: 'ok' })
    } catch (e) {
      setToast({ msg: e instanceof ApiError ? e.message : 'Export failed', tone: 'bad' })
    } finally {
      setExporting(false)
    }
  }

  const { eyebrow } = runLabel(run, meta)
  const stats = run?.stats
  const total = allList?.list?.total ?? stats?.unique ?? 0
  const isEmpty = run?.status === 'done' && stats?.unique === 0
  const partial = run && run.status !== 'done' && run.status !== 'queued' && run.status !== 'running'
  const query = run?.params.trade
    ? `${tradeWord(meta?.trades.find((t) => t.key === run.params.trade)?.label ?? run.params.trade)} in ${meta?.states.find((s) => s.code === run.params.state)?.name ?? run.params.state}`
    : (run?.params.fileName ?? 'this file')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">
            {eyebrow}
            {partial && ' · partial'}
          </p>
          <h1 className="text-[clamp(26px,3.2vw,34px)] leading-[1.15] font-semibold tracking-[-0.02em]">
            {!stats ? 'Loading results…' : isEmpty ? 'No results' : `${plural(total, 'business', 'businesses')}, ranked by readiness to sell`}
          </h1>
        </div>
        <div className="flex w-full items-center gap-2.5 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          <button type="button" onClick={onNewSearch} className="h-11 rounded-[10px] border border-line2 bg-panel px-4 text-sm font-medium hover:border-tx3">
            New search
          </button>
          {!isEmpty && <ExportMenu count={current?.list?.filtered ?? 0} onExport={(f) => void exportFile(f)} busy={exporting || loading} />}
        </div>
      </div>

      {run?.notice && <Alert tone="warn">{run.notice}</Alert>}
      {partial && (
        <Alert tone="warn" title={run.status === 'cancelled' ? 'Run cancelled' : 'Run stopped early'}>
          {run.progress.processed} of {run.progress.total} businesses were scored; the rest show as “Not scored”.
          {run.error && ` ${run.error}`}
        </Alert>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel px-6 py-[clamp(32px,6vw,64px)] text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-panel3 font-mono text-xl text-tx3">0</div>
          <div className="text-xl font-semibold">No businesses found for {query}</div>
          <div className="max-w-[440px] text-[15px] leading-relaxed text-pretty text-tx2">
            OpenStreetMap had no listings with a website for this search. Try a neighboring state or another trade, or import a list you already have.
          </div>
          <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={onNewSearch} className="btn-primary h-11 px-[18px] text-sm">
              Change search
            </button>
            <button type="button" onClick={onImportInstead} className="h-11 rounded-[10px] border border-line2 bg-panel px-4 text-sm font-medium hover:border-tx3">
              Import CSV instead
            </button>
          </div>
        </div>
      ) : (
        <>
          {stats && <SummaryCards stats={stats} />}
          <FilterBar
            filters={filters}
            onChange={onFilters}
            counts={allList?.list?.counts ?? { A: 0, B: 0, C: 0 }}
            total={total}
            shown={current?.list?.filtered ?? 0}
            states={states}
          />
          <div className="-mt-2 flex flex-wrap gap-x-[18px] gap-y-1 px-1 text-[13px] text-tx3">
            <span className="flex items-center gap-2">
              <span className="rounded-[5px] border-b border-dashed border-fill-ln bg-fill px-[7px] py-px text-tx">Aa</span>
              Filled in by SellSignal: hover for the source
            </span>
            <span>Click any row for the full score evidence</span>
          </div>

          {current?.error && <Alert title="Couldn't load the leads">{current.error}</Alert>}
          {!items && !current?.error && <div className="rounded-[14px] border border-line bg-panel p-8 text-center text-sm text-tx3">Loading leads…</div>}

          {items && items.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 rounded-[14px] border border-line bg-panel px-5 py-12 text-center">
              <div className="text-base font-semibold">No leads match these filters</div>
              {hasAnyFilter(filters) && (
                <button type="button" onClick={() => onFilters(NO_FILTERS)} className="h-10 rounded-[10px] border border-line2 bg-panel2 px-4 text-sm">
                  Clear filters
                </button>
              )}
            </div>
          )}

          {items && items.length > 0 && (
            <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              <div className="hidden md:block">
                <LeadTable leads={items} onOpen={setDrawer} />
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {items.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={setDrawer} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {drawer && <LeadDrawer lead={drawer} onClose={() => setDrawer(null)} />}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </div>
  )
}
