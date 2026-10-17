// API shapes (mirrors server/src/routes/*.ts; kept here so the client deploys on its own).

export type TradeKey = 'hvac' | 'plumbing' | 'electrical' | 'roofing'
export type Tier = 'A' | 'B' | 'C'

export interface Meta {
  trades: Array<{ key: TradeKey; label: string; osmTag: string }>
  states: Array<{ code: string; name: string }>
  limits: { maxDiscover: number; maxCsvRows: number; recommendedRows: number }
  defaultWeights: Record<string, number>
  tiers: Record<Tier, string>
}

export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type Stage = 'queued' | 'reading' | 'merging' | 'enriching' | 'scoring' | 'done'
export type RunSourceType = 'osm' | 'csv' | 'seed' | 'sample'

export interface RunStats {
  rowsIn: Partial<Record<'osm' | 'csv' | 'seed', number>>
  duplicatesMerged: number
  unique: number
  crossSourceDuplicates: number
  completeness: { before: number; after: number }
  fieldsFilled: number
  sites: { ok: number; blocked: number; unreachable: number; robotsDisallowed: number; noWebsite: number; cached: number }
  tiers: Record<Tier, number>
  topSignals: Array<{ key: string; label: string; count: number }>
  fillRates: { phone: number; email: number; yearFounded: number; ownerName: number }
  ai: { enabled: boolean; calls: number }
  timings: { startedAt: string | null; finishedAt: string | null; elapsedMs: number; avgSiteMs: number }
  warnings: string[]
}

export interface RunView {
  id: string
  sourceType: RunSourceType
  params: { trade?: TradeKey; state?: string; fileName?: string; rows?: number }
  status: RunStatus
  createdAt: string
  progress: { stage: Stage; processed: number; total: number; pct: number }
  stats: RunStats
  buybox: { industries: TradeKey[]; states: string[]; weights: Record<string, number> }
  notice: string | null
  error: string | null
}

export interface StartedRun {
  runId: string
  status: RunStatus
  sourceType: RunSourceType
  rows?: number
  warnings?: string[]
}
