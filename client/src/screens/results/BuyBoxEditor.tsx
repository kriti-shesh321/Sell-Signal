import { useEffect, useRef, useState } from 'react'
import { ApiError, updateBuyBox } from '../../api'
import { StatePicker } from '../../components/StatePicker'
import type { Meta, RescoreResult, RunView, TradeKey } from '../../types'

interface Props {
  run: RunView
  meta: Meta | null
  onRescored: (r: RescoreResult) => void
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * Edit which trades and states count as "in the buy-box", then rescore. The server re-scores from the
 * signals it already stored, so no website is visited again.
 */
export function BuyBoxEditor({ run, meta, onRescored }: Props) {
  const [open, setOpen] = useState(false)
  const [industries, setIndustries] = useState<TradeKey[]>(run.buybox.industries)
  const [states, setStates] = useState<string[]>(run.buybox.states)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const finished = run.status === 'done' || run.status === 'cancelled' || run.status === 'failed'
  const changed = !sameSet(industries, run.buybox.industries) || !sameSet(states, run.buybox.states)
  const trades = meta?.trades ?? []
  const stateName = (code: string) => meta?.states.find((s) => s.code === code)?.name ?? code
  const w = run.buybox.weights

  const toggle = () => {
    if (!open) {
      setIndustries(run.buybox.industries)
      setStates(run.buybox.states)
      setError(null)
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // composedPath() is fixed when the event fires: choosing a state removes the option from the DOM
    // before this runs, so contains(e.target) would wrongly treat it as an outside click.
    const onClick = (e: MouseEvent) => root.current && !e.composedPath().includes(root.current) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const r = await updateBuyBox(run.id, { industries, states })
      setOpen(false)
      onRescored(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Rescoring failed')
    } finally {
      setSaving(false)
    }
  }

  const summary = `${run.buybox.industries.length === trades.length && trades.length ? 'All trades' : `${run.buybox.industries.length} trades`} · ${
    run.buybox.states.length ? run.buybox.states.join(', ') : 'no states'
  }`

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!finished}
        title={finished ? undefined : 'Available when the run finishes'}
        onClick={toggle}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-line2 bg-panel px-4 text-sm font-medium hover:border-tx3 disabled:opacity-60"
      >
        Buy-box
        <span className="hidden max-w-[160px] truncate text-xs font-normal text-tx3 lg:inline">{open ? '' : summary}</span>
        <span aria-hidden className="text-[10px] text-tx3">
          ▼
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Edit buy-box"
          className="fixed inset-x-4 top-24 z-30 flex flex-col gap-4 rounded-xl border border-line2 bg-panel p-4 shadow-panel sm:absolute sm:inset-x-auto sm:top-[52px] sm:right-0 sm:w-[360px]"
        >
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">Buy-box</div>
            <p className="text-xs leading-snug text-tx3">
              Leads in a chosen trade get +{w.industry ?? 15}, in a chosen state +{w.state ?? 5}. Rescoring reuses what was already found, so no website is
              visited again.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium text-tx2">Trades</legend>
            <div className="grid grid-cols-2 gap-2">
              {trades.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={industries.includes(t.key)}
                    onChange={(e) => setIndustries((xs) => (e.target.checked ? [...xs, t.key] : xs.filter((x) => x !== t.key)))}
                    className="accent-[var(--acc)]"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-medium text-tx2">States</div>
            {states.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {states.map((code) => (
                  <li key={code} className="flex items-center gap-1 rounded-full border border-line bg-panel2 py-0.5 pr-1 pl-2.5 text-xs">
                    {stateName(code)}
                    <button
                      type="button"
                      aria-label={`Remove ${stateName(code)}`}
                      onClick={() => setStates((xs) => xs.filter((x) => x !== code))}
                      className="grid size-5 place-items-center rounded-full text-tx3 hover:bg-panel3 hover:text-tx"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-tx3">No states: no lead gets the state points.</p>
            )}
            <StatePicker
              label="Add state"
              size="sm"
              value=""
              allOption={{ value: '', label: 'Add a state…' }}
              options={(meta?.states ?? []).filter((s) => !states.includes(s.code)).map((s) => ({ value: s.code, label: s.name }))}
              onChange={(code) => code && setStates((xs) => [...xs, code])}
            />
          </div>

          {error && <p className="text-xs text-bad">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-[10px] border border-line2 bg-panel2 px-4 text-sm">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={!changed || saving} className="btn-primary h-10 px-4 text-sm disabled:opacity-60">
              {saving ? 'Rescoring…' : 'Rescore'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
