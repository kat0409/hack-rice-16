import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

export function PreviewBanner({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex items-start gap-3 rounded-xl border-2 border-dashed border-accent/30 bg-accent-soft px-4 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-accent shadow-chunky-sm">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <p className="text-sm text-ink-soft">
        <span className="font-semibold text-accent-dark">Preview.</span> {children}
      </p>
    </div>
  )
}
