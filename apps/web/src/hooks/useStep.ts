import { useSearchParams } from 'react-router-dom'
import { useStudySession } from '@/hooks/useStudySession'
import { activeStepOf } from '@/lib/sessionStore'
import type { StudyStep } from '@/types/study'

/** The step a study tool should act on: `?step=` if given, else the route's active step. */
export function useStep(courseId: string | undefined): {
  step: StudyStep | undefined
  steps: StudyStep[]
  loading: boolean
  select: (stepId: string) => void
} {
  const { session, loading } = useStudySession(courseId)
  const [params, setParams] = useSearchParams()
  const steps = session.courseId === courseId ? session.steps : []
  const wanted = params.get('step')
  const step = (wanted && steps.find((s) => s.id === wanted)) || activeStepOf(steps)
  const select = (stepId: string) => setParams({ step: stepId })
  return { step, steps, loading, select }
}
