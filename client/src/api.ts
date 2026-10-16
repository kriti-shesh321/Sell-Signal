const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')

export type Health = { ok: boolean; db: 'up' | 'down'; version: string; aiFallback: 'on' | 'off' }

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch(`${API_URL}/api/health`, { signal })
  const body = (await res.json()) as Health
  return body
}

export { API_URL }
