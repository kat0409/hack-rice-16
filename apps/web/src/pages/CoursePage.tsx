import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LearningRoute } from '@/components/route/LearningRoute'
import { ScrollProgressHint } from '@/components/route/ScrollProgressHint'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { Tabs } from '@/components/ui/Tabs'
import { useCourse } from '@/hooks/useCourse'
import { useIsInView } from '@/hooks/useIsInView'
import { useStudySession } from '@/hooks/useStudySession'
import { api, type ApiError } from '@/lib/api'
import { mapSession, withActiveStep } from '@/lib/mappers'
import { setSession } from '@/lib/sessionStore'
import type { StudyStep } from '@/types/study'

type GoalFormProps = {
  courseId: string
  onCreated: () => void
  onCancel?: () => void
}

function GoalForm({ courseId, onCreated, onCancel }: GoalFormProps) {
  const [goal, setGoal] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [weakness, setWeakness] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!goal.trim()) return
    setBusy(true)
    setError(null)
    try {
      const dto = await api.createStudySession(courseId, {
        goal_text: goal.trim(),
        available_minutes: minutes,
        weakness_text: weakness.trim() || null,
      })
      setSession({ courseId, sessionId: dto.id, goalText: dto.goal_text, steps: mapSession(dto) })
      onCreated()
    } catch (err) {
      const apiErr = err as ApiError
      setError(
        apiErr.code === 'NO_GOAL_MATCH'
          ? 'No concepts in your sources matched that goal — try broader wording, or upload more notes.'
          : apiErr.message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-ink/10 bg-paper px-5 py-5 shadow-chunky">
      <div>
        <Eyebrow size="card">Your goal</Eyebrow>
        <Heading as="h2" size="section" className="mt-0.5">
          Where are you trying to get to?
        </Heading>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-ink-soft">What do you need to be ready for?</span>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          placeholder="e.g. Exam tomorrow on searching, recursion and complexity"
          className="rounded-xl border-2 border-ink/15 bg-paper-dark px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-ink-soft">Minutes available</span>
          <input
            type="number"
            min={5}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-11 rounded-xl border-2 border-ink/15 bg-paper-dark px-4 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-ink-soft">What feels weak? (optional)</span>
          <input
            value={weakness}
            onChange={(e) => setWeakness(e.target.value)}
            placeholder="e.g. recursion"
            className="h-11 rounded-xl border-2 border-ink/15 bg-paper-dark px-4 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !goal.trim()}>
          {busy ? 'Routing…' : 'Build my route'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

export function CoursePage() {
  const { courseId = '' } = useParams()
  const { course } = useCourse(courseId)
  const { session, loading, error } = useStudySession(courseId)
  const [showForm, setShowForm] = useState(false)
  const [bottomSentinelRef, isAtBottom] = useIsInView<HTMLDivElement>()

  const steps = session.courseId === courseId ? session.steps : []
  const hasRoute = steps.length > 0
  const completed = steps.filter((s) => s.status === 'COMPLETE').length
  const allocated = steps.reduce((sum, s) => sum + s.allocatedMinutes, 0)

  const completeStep = async (step: StudyStep) => {
    const next = withActiveStep(
      steps.map((s) => (s.id === step.id ? { ...s, status: 'COMPLETE' as const } : { ...s, status: s.status === 'ACTIVE' ? ('TODO' as const) : s.status })),
    )
    setSession({ steps: next })
    try {
      await api.patchStudyStep(step.id, 'COMPLETE')
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2.5 rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>{course?.name ?? 'Subject'}</Eyebrow>
            <Heading as="h1" size="page" className="mt-0.5 font-retro font-normal">
              {hasRoute ? 'Your study route' : 'Learning Path'}
            </Heading>
          </div>
          <Tabs
            items={[
              { key: 'path', label: 'Path', to: `/course/${courseId}/path` },
              { key: 'map', label: 'Map', to: `/course/${courseId}/map` },
            ]}
          />
        </div>

        {hasRoute && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
              <span className="whitespace-nowrap">{allocated} minutes planned</span>
              <span className="whitespace-nowrap">· {steps.length} concepts</span>
              <span className="whitespace-nowrap">· {completed} completed</span>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="ml-auto text-xs font-semibold text-accent hover:underline"
              >
                New goal
              </button>
            </div>
            <p className="max-w-2xl truncate font-serif text-xs italic text-ink-soft/70" title={session.goalText}>
              &ldquo;{session.goalText}&rdquo;
            </p>
          </>
        )}
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {(showForm || (!loading && !hasRoute)) && (
        <GoalForm
          courseId={courseId}
          onCreated={() => setShowForm(false)}
          onCancel={hasRoute ? () => setShowForm(false) : undefined}
        />
      )}

      {!loading && !hasRoute && !showForm && (
        <p className="text-sm text-ink-soft">
          No route yet. If you haven&apos;t added notes,{' '}
          <Link to={`/course/${courseId}/sources`} className="font-semibold text-accent hover:underline">
            start on the Sources page
          </Link>
          .
        </p>
      )}

      {hasRoute && <LearningRoute steps={steps} onComplete={completeStep} />}

      <div ref={bottomSentinelRef} aria-hidden="true" className="h-px w-full" />

      {hasRoute && <ScrollProgressHint isAtBottom={isAtBottom} />}
    </div>
  )
}
