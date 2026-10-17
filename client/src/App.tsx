import { useCallback, useEffect, useState } from 'react'
import { ApiError, cancelRun, getMeta } from './api'
import { Header, type Step } from './components/Header'
import { ThemeToggle } from './components/ThemeToggle'
import { readLocation, writeLocation, type Location } from './lib/url'
import { useRunPolling } from './lib/useRunPolling'
import { useTheme } from './lib/useTheme'
import { Processing } from './screens/Processing'
import { ResultsPlaceholder } from './screens/ResultsPlaceholder'
import { Start } from './screens/Start'
import { isFinished, submitStart, type StartRequest } from './lib/run'
import type { Meta } from './types'

export default function App() {
  const { theme, setTheme } = useTheme()
  const [loc, setLoc] = useState<Location>(readLocation)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<StartRequest | null>(null)
  const { run, error: runError } = useRunPolling(loc.runId)

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

  const navigate = (next: Location) => {
    writeLocation(next)
    setLoc(next)
    window.scrollTo({ top: 0 })
  }

  // A finished run shows its results; a failed one stays on processing (with Retry) unless asked.
  const screen: Step = !loc.runId ? 0 : loc.view === 'results' || isFinished(run) ? 2 : 1
  const home = () => navigate({ runId: null, view: null })

  const retry = async () => {
    if (!lastRequest) return home()
    try {
      const started = await submitStart(lastRequest)
      navigate({ runId: started.runId, view: null })
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
            onStarted={(started, req) => {
              setLastRequest(req)
              navigate({ runId: started.runId, view: null })
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
            onViewResults={() => loc.runId && navigate({ runId: loc.runId, view: 'results' })}
            onStartOver={home}
          />
        )}
        {screen === 2 && <ResultsPlaceholder run={run} meta={meta} onNewSearch={home} />}
      </main>
    </>
  )
}
