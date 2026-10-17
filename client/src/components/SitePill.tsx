import type { SiteState } from '../types'

const PILLS: Partial<Record<SiteState, { label: string; title: string; cls: string }>> = {
  blocked: { label: 'Site blocked', title: 'The site blocks automated visits. Scored from listing data only.', cls: 'text-warn bg-warn-bg' },
  unreachable: { label: 'Site unreachable', title: "The website didn't respond after 2 tries. Scored from listing data only.", cls: 'text-bad bg-bad-bg' },
  robots_disallowed: { label: 'Not crawled', title: "The site's robots.txt asks bots not to visit, so we didn't. Scored from listing data only.", cls: 'text-tx2 bg-panel3' },
}

export function SitePill({ status }: { status: SiteState }) {
  const p = PILLS[status]
  if (!p) return null
  return (
    <span title={p.title} className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${p.cls}`}>
      {p.label}
    </span>
  )
}
