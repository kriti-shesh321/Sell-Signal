import { useCallback, useEffect, useState } from 'react'
import { ApiError, getRun } from '../api'
import type { RunView } from '../types'

const ACTIVE = new Set(['queued', 'running'])

type Polled = { runId: string; run: RunView | null; error: ApiError | null }

/** Fetch a run, then re-fetch every 2 s while it's queued or running. `refresh` fetches it again on demand. */
export function useRunPolling(runId: string | null, intervalMs = 2000) {
  const [state, setState] = useState<Polled | null>(null)
  const [rev, setRev] = useState(0)
  const refresh = useCallback(() => setRev((r) => r + 1), [])

  useEffect(() => {
    if (!runId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ctrl = new AbortController()

    const tick = async () => {
      try {
        const run = await getRun(runId, ctrl.signal)
        if (stopped) return
        setState({ runId, run, error: null })
        if (ACTIVE.has(run.status)) timer = setTimeout(tick, intervalMs)
      } catch (err) {
        if (stopped) return
        const error = err instanceof ApiError ? err : new ApiError('Something went wrong', 0, 'UNKNOWN')
        setState((prev) => ({ runId, run: prev?.runId === runId ? prev.run : null, error }))
        // a missing run won't appear later; a network blip might recover
        if (error.status !== 404) timer = setTimeout(tick, intervalMs * 2)
      }
    }
    void tick()
    return () => {
      stopped = true
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [runId, intervalMs, rev])

  // State from a previous run never leaks into the current one.
  const current = state && state.runId === runId ? state : null
  return { run: current?.run ?? null, error: current?.error ?? null, refresh }
}
