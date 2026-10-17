import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface PickerOption {
  value: string
  label: string
}

interface Props {
  value: string
  options: PickerOption[]
  onChange: (value: string) => void
  /** Accessible name, e.g. "State". */
  label: string
  /** Optional first entry, e.g. { value: '', label: 'All states' }. */
  allOption?: PickerOption
  size?: 'md' | 'sm'
}

/**
 * Searchable single-select (ARIA combobox + listbox). Used instead of a native <select>, whose popup
 * on some Linux desktops opens under the cursor and picks the option on mouse-up.
 */
export function StatePicker({ value, options, onChange, label, allOption, size = 'md' }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const all = useMemo(() => (allOption ? [allOption, ...options] : options), [allOption, options])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase() === q)
  }, [all, query])
  const current = all.find((o) => o.value === value)

  const openList = () => {
    setQuery('')
    setActive(Math.max(0, all.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const choose = (o: PickerOption | undefined) => {
    if (o) onChange(o.value)
    close()
  }

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && close()
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted option in view while using the arrow keys.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(shown.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(shown[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      close()
    }
  }

  const height = size === 'md' ? 'h-12 text-[15px] rounded-[10px] px-3.5' : 'h-[38px] text-sm rounded-[9px] px-3'

  return (
    <div ref={root} className="relative">
      {!open ? (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-label={`${label}: ${current?.label ?? 'none'}`}
          onClick={openList}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openList()
            }
          }}
          className={`flex w-full items-center justify-between gap-2 border border-line2 bg-panel2 text-left text-tx transition hover:border-tx3 ${height}`}
        >
          <span className="truncate">{current?.label ?? 'Choose…'}</span>
          <span aria-hidden className="text-[10px] text-tx3">
            ▼
          </span>
        </button>
      ) : (
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={shown[active] ? `${id}-opt-${active}` : undefined}
          aria-autocomplete="list"
          aria-label={label}
          placeholder={`Type to search ${label.toLowerCase()}s…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
          className={`w-full border border-acc bg-panel2 text-tx placeholder:text-tx3 ${height}`}
        />
      )}
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute top-[calc(100%+6px)] left-0 z-30 max-h-[min(320px,50vh)] w-full min-w-[200px] overflow-y-auto overscroll-contain rounded-xl border border-line2 bg-panel p-1.5 shadow-panel"
        >
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-tx3">No match</li>}
          {shown.map((o, i) => (
            <li
              key={o.value || '__all'}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              // mousedown (not click) so the input doesn't lose focus and close the list first
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o)
              }}
              onMouseMove={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${
                i === active ? 'bg-panel2 text-tx' : 'text-tx2'
              }`}
            >
              {o.label}
              {o.value === value && <span className="text-acc">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
