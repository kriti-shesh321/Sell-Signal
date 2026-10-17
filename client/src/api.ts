import type { BuyBox, ExportFormat, LeadList, Meta, RescoreResult, RunView, StartedRun } from './types'

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

/** Change the run's buy-box; the server rescores from stored signals without re-visiting any site. */
export const updateBuyBox = (id: string, buybox: Pick<BuyBox, 'industries' | 'states'>) =>
  call<RescoreResult>(`/api/runs/${encodeURIComponent(id)}/buybox`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buybox),
  })

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

export const getLeads = (id: string, query: URLSearchParams, signal?: AbortSignal) =>
  call<LeadList>(`/api/runs/${encodeURIComponent(id)}/leads${query.toString() ? `?${query}` : ''}`, { signal })

/** Download an export with the current filters; returns the file name and row count for the toast. */
export async function downloadExport(id: string, format: ExportFormat, query: URLSearchParams) {
  const q = new URLSearchParams(query)
  q.set('format', format)
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/runs/${encodeURIComponent(id)}/export?${q}`)
  } catch {
    throw new ApiError("Couldn't reach the SellSignal API to download the export.", 0, 'NETWORK')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error?.message ?? `Export failed (HTTP ${res.status})`, res.status, body?.error?.code ?? 'HTTP')
  }
  const fileName = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `sellsignal-${format}.csv`
  const rows = Number(res.headers.get('x-row-count') ?? 0)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { fileName, rows }
}
