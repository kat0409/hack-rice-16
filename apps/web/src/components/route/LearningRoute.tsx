import { useMemo } from 'react'
import type { StudyStep } from '@/types/study'
import { buildRoutePath, computeRouteLayout, totalRouteHeight } from '@/lib/routeLayout'
import { RoutePathSvg } from './RoutePathSvg'
import { RouteNode } from './RouteNode'

const VIEWBOX_WIDTH = 1000

type LearningRouteProps = {
  steps: StudyStep[]
  onComplete?: (step: StudyStep) => void
}

export function LearningRoute({ steps, onComplete }: LearningRouteProps) {
  const extraGapAfter = useMemo(
    () => steps.map((step) => (step.status === 'ACTIVE' ? 150 : 0)),
    [steps],
  )
  const centerIndices = useMemo(
    () => steps.flatMap((step, index) => (step.status === 'ACTIVE' ? [index] : [])),
    [steps],
  )
  const points = useMemo(
    () => computeRouteLayout(steps.map((step) => step.id), { extraGapAfter, centerIndices }),
    [steps, extraGapAfter, centerIndices],
  )
  const pathD = useMemo(() => buildRoutePath(points, VIEWBOX_WIDTH), [points])
  const height = useMemo(() => totalRouteHeight(points), [points])

  const progress = useMemo(() => {
    if (steps.length <= 1) return 0
    const activeIndex = steps.findIndex((step) => step.status === 'ACTIVE')
    if (activeIndex >= 0) return activeIndex / (steps.length - 1)
    const lastCompleteIndex = steps.reduce(
      (acc, step, index) => (step.status === 'COMPLETE' ? index : acc),
      -1,
    )
    return lastCompleteIndex >= 0 ? lastCompleteIndex / (steps.length - 1) : 0
  }, [steps])

  return (
    <div className="relative" style={{ height }}>
      <RoutePathSvg d={pathD} width={VIEWBOX_WIDTH} height={height} progress={progress} />
      {points.map((point, index) => {
        const step = steps[index]
        return (
          <div
            key={point.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 px-2"
            style={{ left: `${point.x * 100}%`, top: point.y }}
          >
            <RouteNode step={step} onComplete={onComplete} />
          </div>
        )
      })}
    </div>
  )
}
