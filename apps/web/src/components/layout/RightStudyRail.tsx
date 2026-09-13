import { Link, useParams } from 'react-router-dom'
import { BookOpen, Layers, Mic, Target } from 'lucide-react'
import { activityLabel } from '@/lib/activity'
import { activeStepOf, useSession } from '@/lib/sessionStore'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'

const tools = [
  { label: 'Summary', path: 'materials', icon: BookOpen },
  { label: 'Flashcards', path: 'flashcards', icon: Layers },
  { label: 'Practice', path: 'practice', icon: Target },
  { label: 'Narrate', path: 'audio', icon: Mic },
]

export function RightStudyRail() {
  const { courseId } = useParams()
  const session = useSession()
  const activeStep = session.courseId === courseId ? activeStepOf(session.steps) : undefined

  if (!courseId) return null

  return (
    <aside className="sticky top-6 my-6 mr-6 hidden h-fit w-[320px] shrink-0 flex-col gap-4 rounded-2xl border-2 border-ink/10 bg-paper p-5 shadow-chunky lg:flex">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
        <Eyebrow size="card">Study Deck</Eyebrow>
      </div>

      {activeStep ? (
        <div className="flex flex-col gap-3 border-l-2 border-accent/40 pl-4">
          <div>
            <Eyebrow size="card" className="text-accent">
              Now studying
            </Eyebrow>
            <Heading as="h3" size="concept" className="mt-0.5">
              {activeStep.conceptName}
            </Heading>
            <p className="mt-0.5 text-xs text-ink-soft">
              {activeStep.allocatedMinutes} min · {activityLabel(activeStep.activityType)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {tools.map((tool) => (
              <Link
                key={tool.path}
                to={`/course/${courseId}/${tool.path}?step=${activeStep.id}`}
                className="flex items-center gap-2 rounded-xl border-2 border-ink/10 bg-paper-dark px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft"
              >
                <tool.icon className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
                {tool.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink/15 px-4 py-12 text-center">
          <p className="mx-auto max-w-[220px] text-sm leading-relaxed text-ink-soft">
            Build a study route on the Learning Path to open its study deck here.
          </p>
        </div>
      )}
    </aside>
  )
}
