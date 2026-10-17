import { useCallback, useEffect, useState } from 'react'
import { ApiError, cancelRun, getMeta } from './api'
import { Header, type Step } from './components/Header'
import { ThemeToggle } from './components/ThemeToggle'
import { readLocation, startLocation, writeLocation, type Location } from './lib/url'
import { useRunPolling } from './lib/useRunPolling'
import { useTheme } from './lib/useTheme'
import { Processing } from './screens/Processing'
import { Results } from './screens/results/Results'
import { Start } from './screens/Start'
import { isFinished, submitStart, type StartRequest } from './lib/run'
import type { Meta } from './types'

export default function App() {
  const { theme, setTheme } = useTheme()
  const [loc, setLoc] = useState<Location>(readLocation)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<StartRequest | null>(null)
  const { run, error: runError, refresh: refreshRun } = useRunPolling(loc.runId)

  const loadMeta = useCallback(() => {
    getMeta()
      .then((m) => {
        setMeta(m)
        setMetaError(null)
      })
      .catch((err: unknown) => setMetaError(err instanceof ApiError ? err.message : 'Unknown error'))
  }, [])
  useEffect(loadMeta, [loadMeta])

  useEffect(() => {
    const onPop = () => setLoc(readLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (next: Location, opts: { replace?: boolean; keepScroll?: boolean } = {}) => {
    writeLocation(next, opts.replace)
    setLoc(next)
    if (!opts.keepScroll) window.scrollTo({ top: 0 })
  }

  // A finished run shows its results; a failed one stays on processing (with Retry) unless asked.
  const screen: Step = !loc.runId ? 0 : loc.view === 'results' || isFinished(run) ? 2 : 1
  const home = () => navigate(startLocation())
  const runLoc = (runId: string, view: Location['view'] = null): Location => ({ ...startLocation(), runId, view })

  const retry = async () => {
    if (!lastRequest) return home()
    try {
      const started = await submitStart(lastRequest)
      navigate(runLoc(started.runId))
    } catch {
      home()
    }
  }

  const cancel = async () => {
    if (loc.runId) await cancelRun(loc.runId).catch(() => {})
    home()
  }

  return (
    <>
      <Header step={screen} onHome={home} right={<ThemeToggle theme={theme} onChange={setTheme} />} />
      <main className="mx-auto max-w-[1440px] px-[clamp(16px,4vw,32px)] pt-10 pb-24">
        {screen === 0 && (
          <Start
            meta={meta}
            metaError={metaError}
            onRetryMeta={loadMeta}
            initialTab={loc.tab}
            onStarted={(started, req) => {
              setLastRequest(req)
              navigate(runLoc(started.runId))
            }}
          />
        )}
        {screen === 1 && (
          <Processing
            run={run}
            loadError={runError?.message ?? null}
            meta={meta}
            canRetry={lastRequest !== null}
            onRetry={() => void retry()}
            onCancel={() => void cancel()}
            onViewResults={() => loc.runId && navigate(runLoc(loc.runId, 'results'))}
            onStartOver={home}
          />
        )}
        {screen === 2 && (
          <Results
            run={run}
            meta={meta}
            filters={loc.filters}
            onFilters={(filters) => navigate({ ...loc, filters, view: 'results' }, { replace: true, keepScroll: true })}
            onNewSearch={home}
            onImportInstead={() => navigate(startLocation('import'))}
            onRunChanged={refreshRun}
          />
        )}
      </main>
    </>
  )
}
