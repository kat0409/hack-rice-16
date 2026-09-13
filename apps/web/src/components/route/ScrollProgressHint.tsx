import { ChevronDown, PartyPopper } from 'lucide-react'

type ScrollProgressHintProps = {
  isRouteComplete: boolean
}

export function ScrollProgressHint({ isRouteComplete }: ScrollProgressHintProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-10 flex justify-center md:bottom-6">
      <div className="flex flex-col items-center gap-1 rounded-full border border-border/60 bg-paper px-3.5 py-1.5 shadow-soft">
        {isRouteComplete ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft/80">
            <PartyPopper className="h-3 w-3 text-accent" strokeWidth={1.75} />
            Route complete
          </span>
        ) : (
          <>
            <span className="text-[11px] font-medium text-ink-soft/70">Continue your route</span>
            <ChevronDown className="h-3 w-3 text-ink-soft/50 motion-safe:animate-bounce-soft" strokeWidth={2} />
          </>
        )}
      </div>
    </div>
  )
}
