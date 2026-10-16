import type { ReactNode } from 'react'

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-hdr backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-[clamp(16px,4vw,32px)]">
        <div
          aria-hidden
          className="grid size-[30px] place-items-center rounded-lg text-[15px] font-bold text-[#04171b]"
          style={{ background: 'linear-gradient(135deg,#36d6c3,#3b82f6)' }}
        >
          S
        </div>
        <span className="text-[17px] font-semibold">SellSignal</span>
        <div className="flex-1" />
        {right}
      </div>
    </header>
  )
}
