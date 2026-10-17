import type { Meta, RunView, StartedRun } from './types'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')

/** An error the API explained, or a network failure with a readable message. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, init)
  } catch {
    throw new ApiError("Couldn't reach the SellSignal API. Check your connection and try again.", 0, 'NETWORK')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(err?.message ?? `Request failed (HTTP ${res.status})`, res.status, err?.code ?? 'HTTP')
  }
  return body as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const getMeta = () => call<Meta>('/api/meta')
export const getRun = (id: string, signal?: AbortSignal) => call<RunView>(`/api/runs/${encodeURIComponent(id)}`, { signal })
export const discover = (trade: string, state: string) => call<StartedRun>('/api/runs/discover', json({ trade, state }))
export const cancelRun = (id: string) => call<{ runId: string; status: string }>(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' })

export function importCsv(file: File) {
  const form = new FormData()
  form.append('file', file)
  return call<StartedRun>('/api/runs/import', { method: 'POST', body: form })
}

export function importSample() {
  const form = new FormData()
  form.append('sample', 'true')
  return call<StartedRun>('/api/runs/import', { method: 'POST', body: form })
}
