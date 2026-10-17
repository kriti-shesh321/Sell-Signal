import type { ReactNode } from 'react'

const TONES = {
  bad: { box: 'border-bad-ln bg-bad-bg', dot: 'bg-bad text-white', mark: '!' },
  warn: { box: 'border-tier-b-ln bg-warn-bg', dot: 'bg-warn text-[#04171b]', mark: 'i' },
} as const

export function Alert({ tone = 'bad', title, children }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode }) {
  const t = TONES[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-[10px] border px-3.5 py-3 text-tx ${t.box}`}>
      <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${t.dot}`}>
        {t.mark}
      </span>
      <div className="flex min-w-0 flex-col gap-1 text-sm leading-relaxed">
        {title && <div className="text-[15px] font-semibold">{title}</div>}
        {children && <div className={title ? 'text-tx2' : ''}>{children}</div>}
      </div>
    </div>
  )
}
