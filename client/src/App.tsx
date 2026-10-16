import { useEffect, useState } from 'react'
import { API_URL, getHealth, type Health } from './api'
import { Header } from './components/Header'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './lib/useTheme'

type Status = { state: 'loading' } | { state: 'ok'; health: Health } | { state: 'error'; message: string }

const tiers = [
  { tier: 'A', range: '70–100', label: 'Call first', cls: 'text-tier-a bg-tier-a-bg border-tier-a-ln' },
  { tier: 'B', range: '45–69', label: 'Nurture', cls: 'text-tier-b bg-tier-b-bg border-tier-b-ln' },
  { tier: 'C', range: '0–44', label: 'Low priority', cls: 'text-tier-c bg-tier-c-bg border-tier-c-ln' },
] as const

export default function App() {
  const { theme, setTheme } = useTheme()
  const [status, setStatus] = useState<Status>({ state: 'loading' })

  useEffect(() => {
    const ctrl = new AbortController()
    getHealth(ctrl.signal)
      .then((health) => setStatus({ state: 'ok', health }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Network error' })
      })
    return () => ctrl.abort()
  }, [])

  const apiUp = status.state === 'ok' && status.health.ok

  return (
    <>
      <Header right={<ThemeToggle theme={theme} onChange={setTheme} />} />
      <main className="mx-auto max-w-[680px] px-[clamp(16px,4vw,32px)] py-12">
        <p className="eyebrow">Acquisition Readiness Score</p>
        <h1 className="mt-3 text-[clamp(30px,4.2vw,44px)] font-semibold tracking-[-0.02em] text-balance">
          Find owners who may be ready to sell.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-tx2">Scaffold check: the API and database connection status is below.</p>

        <section className="mt-8 rounded-2xl border border-line bg-panel p-5 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">API</p>
              <p className="mt-1 font-mono text-xs text-tx3 break-all">{API_URL}</p>
            </div>
            <span
              className={`rounded-lg border px-2.5 py-1 font-mono text-sm font-semibold ${
                apiUp
                  ? 'border-tier-a-ln bg-tier-a-bg text-tier-a'
                  : status.state === 'loading'
                    ? 'border-line bg-panel2 text-tx3'
                    : 'border-bad-ln bg-bad-bg text-bad'
              }`}
            >
              {status.state === 'loading' ? 'checking…' : apiUp ? 'API: up' : 'API: down'}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-sm">
            <div className="rounded-xl bg-panel2 p-3">
              <dt className="text-xs text-tx3">Database</dt>
              <dd className="mt-1">{status.state === 'ok' ? status.health.db : '—'}</dd>
            </div>
            <div className="rounded-xl bg-panel2 p-3">
              <dt className="text-xs text-tx3">AI fallback</dt>
              <dd className="mt-1">{status.state === 'ok' ? status.health.aiFallback : '—'}</dd>
            </div>
          </dl>
          {status.state === 'error' && (
            <p className="mt-4 rounded-xl border border-bad-ln bg-bad-bg p-3 text-sm text-bad">
              Couldn't reach the API ({status.message}). Is the server running?
            </p>
          )}
        </section>

        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {tiers.map((t) => (
            <div key={t.tier} className="rounded-xl border border-line bg-panel p-4">
              <span className={`inline-block rounded-lg border px-2 py-0.5 font-mono text-sm font-bold ${t.cls}`}>{t.tier}</span>
              <p className="mt-2 font-mono text-sm">{t.range}</p>
              <p className="text-sm text-tx2">{t.label}</p>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
