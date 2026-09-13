import { Link, useParams } from 'react-router-dom'
import { Map } from 'lucide-react'
import { DEMO_COURSE_ID } from '@/data/mockCourse'

export function MapPage() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-dark/50 text-ink-soft">
        <Map className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest2 text-ink-soft/60">Knowledge Map</p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink">How does everything connect?</h2>
      </div>
      <p className="max-w-md text-sm text-ink-soft">
        The full interactive knowledge graph — with prerequisite highlighting and edge evidence — arrives in a
        later build phase.
      </p>
      <Link
        to={`/course/${courseId}/path`}
        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to your learning path
      </Link>
    </div>
  )
}
