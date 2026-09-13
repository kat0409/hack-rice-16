import { ChevronDown, PartyPopper } from 'lucide-react'

type ScrollProgressHintProps = {
  /** True only while the bottom-of-route sentinel is on screen — flips back
   *  to false as soon as the user scrolls away from it. */
  isAtBottom: boolean
}

export function ScrollProgressHint({ isAtBottom }: ScrollProgressHintProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-10 flex justify-center md:bottom-6">
      <div className="flex flex-col items-center gap-1 rounded-full border-2 border-ink/10 bg-paper px-3.5 py-1.5 shadow-chunky-sm">
        {isAtBottom ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft/80">
            <PartyPopper className="h-3 w-3 text-accent" strokeWidth={1.75} />
            Done with your study route — good job!
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
