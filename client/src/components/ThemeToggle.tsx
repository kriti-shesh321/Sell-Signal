import type { Theme } from '../lib/useTheme'

/** Pill that shows the current theme and switches to the other one. */
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`Switch to ${next} theme`}
      className="flex h-9 items-center gap-2 rounded-full border border-line2 bg-panel px-3.5 text-[13px] font-medium text-tx2 transition hover:border-tx3 hover:text-tx"
    >
      <span
        aria-hidden
        className={`size-3 rounded-full ${theme === 'dark' ? 'bg-tx2 shadow-[inset_-4px_-1px_0_0_var(--panel)]' : 'bg-tier-b'}`}
      />
      {theme === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
