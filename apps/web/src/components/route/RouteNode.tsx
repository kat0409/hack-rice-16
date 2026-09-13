import { Check } from 'lucide-react'
import type { StudyStep } from '@/types/study'
import { activityIcon, activityLabel } from '@/lib/activity'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'

type RouteNodeProps = {
  step: StudyStep
}

export function RouteNode({ step }: RouteNodeProps) {
  const isReinforcement = step.isReinforcement === true

  if (step.status === 'COMPLETE') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-soft/80 text-paper shadow-chunky-sm">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="max-w-[140px] text-xs font-medium text-ink-soft">{step.conceptName}</span>
      </div>
    )
  }

  if (step.status === 'ACTIVE') {
    const ActivityIcon = activityIcon[step.activityType]
    return (
      <div className="flex w-[240px] flex-col items-center text-center sm:w-[300px] lg:w-[340px]">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-paper shadow-node ring-[6px] ring-accent-soft">
          <span className="h-3.5 w-3.5 rounded-full bg-paper" aria-hidden="true" />
        </span>
        <span className="h-4 w-0.5 bg-accent/40" aria-hidden="true" />
        <div className="w-full rounded-2xl border-2 border-accent/25 bg-paper px-6 py-5 text-left shadow-chunky-accent">
          <div className="flex items-center justify-between">
            <Eyebrow size="card" className="text-accent">
              You&apos;re here
            </Eyebrow>
            <ActivityIcon className="h-3.5 w-3.5 text-accent/70" strokeWidth={1.75} />
          </div>
          <Heading as="h3" size="concept" className="mt-1.5">
            {step.conceptName}
          </Heading>
          <p className="mt-1 text-xs text-ink-soft">
            Current step · {step.allocatedMinutes} min · {activityLabel(step.activityType)}
          </p>
        </div>
      </div>
    )
  }

  if (isReinforcement) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-ink-soft/50">
          <span className="h-2 w-2 rounded-full bg-ink-soft/40" aria-hidden="true" />
        </span>
        <div className="max-w-[150px]">
          <span className="block text-xs font-medium text-ink-soft">{step.conceptName}</span>
          <span className="block text-[10px] text-ink-soft/60">
            Added to your route · {step.allocatedMinutes} min
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="h-7 w-7 rounded-full border-2 border-ink/15" aria-hidden="true" />
      <div className="max-w-[150px]">
        <span className="block text-xs font-medium text-ink-soft">{step.conceptName}</span>
        <span className="block text-[10px] text-ink-soft/60">{step.allocatedMinutes} min</span>
      </div>
    </div>
  )
}
