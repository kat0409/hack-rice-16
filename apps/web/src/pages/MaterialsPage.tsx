import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Layers, Mic, Target } from 'lucide-react'
import { StepPicker } from '@/components/study/StepPicker'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { useArtifact } from '@/hooks/useArtifact'
import { useCourse } from '@/hooks/useCourse'
import { useStep } from '@/hooks/useStep'
import type { SummaryContent } from '@/lib/api'

const tools = [
  { key: 'flashcards', label: 'Flashcards', icon: Layers, description: 'Front-and-back cards for this step.' },
  { key: 'practice', label: 'Practice', icon: Target, description: 'Multiple-choice checks with cited explanations.' },
  { key: 'audio', label: 'Narrate', icon: Mic, description: 'Hear this summary read aloud.' },
]

export function MaterialsPage() {
  const { courseId = '' } = useParams()
  const { course } = useCourse(courseId)
  const { step, steps, loading: stepLoading, select } = useStep(courseId)
  const { artifact, loading, error } = useArtifact<SummaryContent>(step?.id, 'SUMMARY')
  const summary = artifact?.content

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>{course?.name ?? 'Subject'}</Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          {step ? step.conceptName : 'Study Materials'}
        </Heading>
        {step && (
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Step {step.position} · {step.allocatedMinutes} min · {step.reason}
          </p>
        )}
      </header>

      <StepPicker courseId={courseId} steps={steps} step={step} loading={stepLoading} onSelect={select} />

      {loading && <p className="text-sm text-ink-soft">Writing a summary from your notes…</p>}
      {error && <p className="text-sm text-red-700">{error.message}</p>}

      {summary && (
        <article className="flex flex-col gap-5 rounded-2xl border-2 border-ink/10 bg-paper px-6 py-5 shadow-chunky">
          <div>
            <Eyebrow size="card">Learning objective</Eyebrow>
            <p className="mt-1 text-sm font-medium text-ink">{summary.learning_objective}</p>
          </div>
          <div className="flex flex-col gap-3">
            {summary.summary_markdown.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink">
                {para}
              </p>
            ))}
          </div>
          {summary.key_points.length > 0 && (
            <div>
              <Eyebrow size="card">Key points</Eyebrow>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                {summary.key_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.common_confusions.length > 0 && (
            <div>
              <Eyebrow size="card">Easy to mix up</Eyebrow>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
                {summary.common_confusions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {artifact && artifact.citations.length > 0 && (
            <div className="border-t-2 border-dashed border-ink/10 pt-4">
              <Eyebrow size="card">From your sources</Eyebrow>
              <ul className="mt-1.5 flex flex-col gap-2">
                {artifact.citations.map((c) => (
                  <li key={c.chunk_id} className="font-serif text-xs italic leading-relaxed text-ink-soft">
                    &ldquo;{c.excerpt}&rdquo;
                    <span className="block not-italic text-ink-soft/60">— {c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}

      {step && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tools.map((item) => (
            <Link
              key={item.key}
              to={`/course/${courseId}/${item.key}?step=${step.id}`}
              className="group flex flex-col gap-2 rounded-2xl border-2 border-ink/10 bg-paper p-5 shadow-chunky transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <item.icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <Heading as="h2" size="section">
                {item.label}
              </Heading>
              <p className="text-sm text-ink-soft">{item.description}</p>
              <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Open
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
