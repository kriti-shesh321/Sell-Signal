import type { ReactNode } from 'react'

export type Step = 0 | 1 | 2
const STEPS = ['Start', 'Processing', 'Results'] as const

export function Header({ step, onHome, right }: { step: Step; onHome: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-hdr backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-7 px-[clamp(16px,4vw,32px)]">
        <button type="button" onClick={onHome} className="flex items-center gap-2.5 rounded-lg" aria-label="SellSignal home">
          <span
            aria-hidden
            className="grid size-[30px] place-items-center rounded-lg text-[15px] font-bold text-[#04171b]"
            style={{ background: 'linear-gradient(135deg,#36d6c3,#3b82f6)' }}
          >
            S
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em]">SellSignal</span>
        </button>
        <nav aria-label="Progress" className="hidden items-center gap-1.5 md:flex">
          {STEPS.map((label, i) => {
            const current = i === step
            const done = i < step
            return (
              <div
                key={label}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium ${current ? 'bg-panel2 text-tx' : 'text-tx3'}`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full font-mono text-[11px] font-semibold ${
                    current ? 'text-[#04171b]' : done ? 'bg-tier-a-bg text-tier-a' : 'bg-panel3 text-tx3'
                  }`}
                  style={current ? { background: 'linear-gradient(135deg,#36d6c3,#4f8df7)' } : undefined}
                >
                  {done ? '✓' : i + 1}
                </span>
                {label}
              </div>
            )
          })}
        </nav>
        <div className="flex-1" />
        {right}
      </div>
    </header>
  )
}
