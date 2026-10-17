export function Toast({ message, tone = 'ok' }: { message: string | null; tone?: 'ok' | 'bad' }) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-7 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-line2 bg-panel3 px-[18px] py-3 text-sm text-tx shadow-panel"
    >
      <span className={`font-bold ${tone === 'ok' ? 'text-tier-a' : 'text-bad'}`}>{tone === 'ok' ? '✓' : '!'}</span>
      {message}
    </div>
  )
}
