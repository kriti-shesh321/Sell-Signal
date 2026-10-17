import { useEffect, useRef, useState } from 'react'
import type { ExportFormat } from '../../types'

const OPTIONS: Array<{ format: ExportFormat; label: string; desc: string }> = [
  { format: 'csv', label: 'CSV', desc: 'All columns, scores, reasons and sources' },
  { format: 'callsheet', label: 'Call sheet', desc: 'A + B tiers, best first, with why-call and empty Outcome / Notes / Follow-up columns' },
  { format: 'hubspot', label: 'HubSpot CSV', desc: 'Mapped to HubSpot company properties for a no-mapping import' },
]

export function ExportMenu({ count, onExport, busy }: { count: number; onExport: (f: ExportFormat) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || count === 0}
        onClick={() => setOpen((o) => !o)}
        className="btn-primary h-11 w-full px-[18px] text-sm disabled:opacity-60"
      >
        {`Export ${count}`} <span aria-hidden className="text-[10px]">▼</span>
      </button>
      {open && (
        <div role="menu" className="absolute top-[52px] right-0 z-25 flex w-[min(320px,calc(100vw-32px))] flex-col rounded-xl border border-line2 bg-panel p-1.5 shadow-panel">
          {OPTIONS.map((o) => (
            <button
              key={o.format}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                onExport(o.format)
              }}
              className="flex w-full flex-col rounded-lg px-3 py-2.5 text-left hover:bg-panel2 focus-visible:bg-panel2"
            >
              <span className="text-sm font-semibold">{o.label}</span>
              <span className="text-xs text-tx3">{o.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
