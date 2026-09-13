import { Link } from 'react-router-dom'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { StudyStep } from '@/types/study'

type StepPickerProps = {
  courseId: string
  steps: StudyStep[]
  step: StudyStep | undefined
  loading: boolean
  onSelect: (stepId: string) => void
}

export function StepPicker({ courseId, steps, step, loading, onSelect }: StepPickerProps) {
  if (loading) return <p className="text-sm text-ink-soft">Loading your route…</p>
  if (steps.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Build a study route on the{' '}
        <Link to={`/course/${courseId}/path`} className="font-semibold text-accent hover:underline">
          Learning Path
        </Link>{' '}
        first — study material is generated one step at a time.
      </p>
    )
  }
  return (
    <label className="flex flex-wrap items-center gap-3 text-sm">
      <Eyebrow size="card">Step</Eyebrow>
      <select
        value={step?.id ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        className="h-10 min-w-[240px] rounded-xl border-2 border-ink/15 bg-paper-dark px-3 text-sm text-ink outline-none focus:border-accent"
      >
        {steps.map((s) => (
          <option key={s.id} value={s.id}>
            {s.position}. {s.conceptName}
            {s.status === 'COMPLETE' ? ' ✓' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
