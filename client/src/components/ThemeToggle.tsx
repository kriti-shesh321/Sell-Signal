import type { Theme } from '../lib/useTheme'

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div role="group" aria-label="Color theme" className="flex rounded-full border border-line bg-panel2 p-0.5 text-xs">
      {(['dark', 'light'] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => onChange(t)}
          className={`rounded-full px-3 py-1 capitalize transition ${
            theme === t ? 'bg-panel3 font-semibold text-tx' : 'text-tx3 hover:text-tx2'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
