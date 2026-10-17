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
  ai: AiStats
  timings: { startedAt: string | null; finishedAt: string | null; elapsedMs: number; avgSiteMs: number }
  warnings: string[]
}

export interface AiStats {
  enabled: boolean
  model: string | null
  calls: number
  cached: number
  filled: { ownerName: number; yearFounded: number; familyOwned: number }
  rejected: number
  errors: number
  skippedCap: number
  stopped: string | null
}

export interface BuyBox {
  industries: TradeKey[]
  states: string[]
  weights: Record<string, number>
}

export interface RescoreResult {
  runId: string
  rescored: number
  tiers: Record<Tier, number>
  buybox: BuyBox
}

export interface RunView {
  id: string
  sourceType: RunSourceType
  params: { trade?: TradeKey; state?: string; fileName?: string; rows?: number }
  status: RunStatus
  createdAt: string
  progress: { stage: Stage; processed: number; total: number; pct: number }
  stats: RunStats
  buybox: BuyBox
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

export interface Found {
  source: string
  method: string
  evidence: string
}

export interface Reason {
  key: string
  label: string
  evidence: string
  source: string
  points: number
}

export type SiteState = 'ok' | 'blocked' | 'unreachable' | 'robots_disallowed' | 'no_website'

export interface Lead {
  id: string
  company: string | null
  domain: string | null
  website: string | null
  phone: string | null
  email: string | null
  street: string | null
  city: string | null
  state: string | null
  industry: TradeKey | 'other' | null
  yearFounded: number | null
  yearsInBusiness: number | null
  ownerName: string | null
  ownerRole: 'owner' | 'founder' | null
  size: string
  revenue: string
  score: number | null
  tier: Tier | null
  reasons: Reason[]
  topReasons: Reason[]
  whyCall: string | null
  fieldSources: Partial<Record<string, { source: string; method?: string; evidence?: string }>>
  filled: string[]
  validation: {
    phoneValid: boolean | null
    emailSyntax: boolean | null
    emailDomainAcceptsMail: boolean | null
    mxHost: string | null
    stateValid: boolean | null
    siteStatus: SiteState
  } | null
  siteStatus: SiteState
  completeness: { before: number | null; after: number | null }
  source: string
  mergedFrom: Array<{ source: string; company: string | null; domain: string | null; phone: string | null; matchedOn: string[] }>
}

export interface LeadList {
  total: number
  filtered: number
  counts: Record<Tier, number>
  items: Lead[]
}

export type ExportFormat = 'csv' | 'callsheet' | 'hubspot'
