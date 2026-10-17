import { useRef, useState, type DragEvent } from 'react'
import { ApiError } from '../api'
import { Alert } from '../components/Alert'
import { TierLegend } from '../components/TierLegend'
import { formatBytes, plural } from '../lib/format'
import { submitStart, tradeWord, type StartRequest } from '../lib/run'
import type { Meta, StartedRun, TradeKey } from '../types'

const MAX_BYTES = 2 * 1024 * 1024

interface Props {
  meta: Meta | null
  metaError: string | null
  onRetryMeta: () => void
  onStarted: (run: StartedRun, req: StartRequest) => void
}

export function Start({ meta, metaError, onRetryMeta, onStarted }: Props) {
  const [tab, setTab] = useState<'find' | 'import'>('find')
  const [trade, setTrade] = useState<TradeKey>('hvac')
  const [state, setState] = useState('TX')
  const [file, setFile] = useState<{ file: File; rows: number } | null>(null)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const tradeLabel = tradeWord(meta?.trades.find((t) => t.key === trade)?.label ?? trade)
  const stateName = meta?.states.find((s) => s.code === state)?.name ?? state
  const maxRows = meta?.limits.maxCsvRows ?? 200
  const recommended = meta?.limits.recommendedRows ?? 50

  const go = async (req: StartRequest) => {
    setBusy(true)
    setError(null)
    try {
      onStarted(await submitStart(req), req)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const pickFile = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setError(`"${f.name}" isn't a CSV file. Export your list as .csv and try again.`)
    if (f.size > MAX_BYTES) return setError(`"${f.name}" is ${formatBytes(f.size)}; the limit is 2 MB (${maxRows} rows).`)
    const text = await f.text()
    const rows = Math.max(0, text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length - 1)
    setFile({ file: f, rows })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    void pickFile(e.dataTransfer.files[0])
  }

  const tabClass = (on: boolean) =>
    `h-[52px] px-[18px] text-[15px] font-semibold transition ${on ? 'text-tx shadow-[inset_0_-2px_0_var(--acc)]' : 'text-tx3 hover:text-tx2'}`

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-7 pt-[clamp(8px,5vh,56px)]">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Acquisition Readiness Score</p>
        <h1 className="text-[clamp(30px,4.2vw,44px)] leading-[1.1] font-semibold tracking-[-0.025em] text-balance">
          Find owners who may be ready to sell.
        </h1>
        <p className="text-[17px] leading-[1.55] text-pretty text-tx2">
          Search a trade and state, or bring your own list. Every business gets a 0–100 score with the evidence behind each point.
        </p>
      </div>

      {metaError && (
        <Alert title="Can't reach the SellSignal API">
          {metaError}{' '}
          <button type="button" onClick={onRetryMeta} className="font-semibold text-acc underline-offset-2 hover:underline">
            Try again
          </button>
        </Alert>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
        <div role="tablist" aria-label="How to start" className="flex border-b border-line px-2">
          <button role="tab" aria-selected={tab === 'find'} className={tabClass(tab === 'find')} onClick={() => { setTab('find'); setError(null) }}>
            Find leads
          </button>
          <button role="tab" aria-selected={tab === 'import'} className={tabClass(tab === 'import')} onClick={() => { setTab('import'); setError(null) }}>
            Import CSV
          </button>
        </div>

        <div role="tabpanel" className="flex flex-col gap-[22px] p-[clamp(20px,3vw,28px)]">
          {tab === 'find' ? (
            <>
              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-2.5 text-[13px] font-semibold text-tx2">Trade</legend>
                <div className="flex flex-wrap gap-2">
                  {(meta?.trades ?? []).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      aria-pressed={trade === t.key}
                      onClick={() => setTrade(t.key)}
                      className={`h-10 rounded-full border px-4 text-sm font-medium transition ${
                        trade === t.key ? 'border-acc bg-fill text-tx' : 'border-line2 bg-panel2 text-tx2 hover:text-tx'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                  {!meta && !metaError && <span className="text-sm text-tx3">Loading trades…</span>}
                </div>
              </fieldset>
              <label className="flex flex-col gap-2.5">
                <span className="text-[13px] font-semibold text-tx2">State</span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="h-12 cursor-pointer rounded-[10px] border border-line2 bg-panel2 px-3.5 text-[15px] text-tx"
                >
                  {(meta?.states ?? [{ code: 'TX', name: 'Texas' }]).map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {error && <Alert>{error}</Alert>}
              <button
                type="button"
                disabled={!meta || busy}
                onClick={() => void go({ kind: 'discover', trade, state })}
                className="btn-primary h-[52px] w-full text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Starting…' : `Find ${tradeLabel} leads in ${stateName}`}
              </button>
            </>
          ) : (
            <>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-5 py-9 text-center transition ${
                  drag ? 'border-acc bg-fill' : 'border-line2 bg-panel2 hover:border-tx3'
                }`}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-panel3 font-mono text-xs font-semibold text-acc">CSV</span>
                <span className="text-base font-semibold">
                  Drop a CSV here, or <span className="text-acc">browse</span>
                </span>
                <span className="text-[13px] text-tx3">
                  Needs a company name column. Phone, website, owner and address help. Up to {maxRows} rows (≈{recommended} recommended).
                </span>
              </button>
              {error && <Alert>{error}</Alert>}
              {file && (
                <div className="flex items-center gap-3 rounded-[10px] border border-line bg-panel2 px-3.5 py-3">
                  <span aria-hidden className="grid size-[22px] place-items-center rounded-full bg-tier-a-bg text-[13px] font-bold text-tier-a">
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{file.file.name}</div>
                    <div className="text-xs text-tx3">
                      {plural(file.rows, 'row')} · {formatBytes(file.file.size)}
                      {file.rows > recommended && ` · more than ${recommended} rows takes a few minutes`}
                    </div>
                  </div>
                  <button type="button" onClick={() => setFile(null)} className="text-[13px] text-tx3 hover:text-tx">
                    Remove
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!file || busy}
                  onClick={() => file && void go({ kind: 'import', file: file.file })}
                  className="btn-primary h-[52px] px-6 text-base disabled:cursor-not-allowed disabled:bg-none disabled:bg-panel3 disabled:text-tx3 disabled:shadow-none"
                >
                  {busy ? 'Uploading…' : 'Score this file'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void go({ kind: 'sample' })}
                  className="h-[52px] px-4 text-[15px] font-medium text-acc underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Use sample file
                </button>
              </div>
            </>
          )}

          <div className="flex items-start gap-2.5 border-t border-line pt-[18px] text-sm leading-[1.55] text-tx2">
            <span className="shrink-0 pt-0.5 font-mono text-xs text-acc">NEXT</span>
            <span className="text-pretty">
              {tab === 'find'
                ? `We find up to ${meta?.limits.maxDiscover ?? 40} ${tradeLabel} businesses on OpenStreetMap, merge duplicates, read each company's public website (respecting robots.txt) to fill missing fields, then score each one. Takes about 1–2 minutes.`
                : 'We merge duplicates, read each company’s public website (respecting robots.txt) to fill missing fields, then score each business. About 1–2 minutes for 50 rows. The sample is a small, labelled synthetic list in SaaSquatch’s export format, plus our seed list.'}
            </span>
          </div>
        </div>
      </div>

      <TierLegend />
    </div>
  )
}
