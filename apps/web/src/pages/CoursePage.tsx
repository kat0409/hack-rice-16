import { useParams } from 'react-router-dom'
import { LearningRoute } from '@/components/route/LearningRoute'
import { ScrollProgressHint } from '@/components/route/ScrollProgressHint'
import { Tabs } from '@/components/ui/Tabs'
import { DEMO_COURSE_ID, mockCourse, mockGoal, mockRoute } from '@/data/mockCourse'

export function CoursePage() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  const totalConcepts = mockRoute.length
  const completedConcepts = mockRoute.filter((step) => step.status === 'COMPLETE').length
  const isRouteComplete = completedConcepts === totalConcepts

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2.5 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest2 text-ink-soft/70">
              {mockCourse.code} · {mockCourse.title}
            </p>
            <h1 className="mt-0.5 font-display text-xl font-semibold text-ink sm:text-2xl">{mockGoal.label}</h1>
          </div>
          <Tabs
            items={[
              { key: 'path', label: 'Path', to: `/course/${courseId}/path` },
              { key: 'map', label: 'Map', to: `/course/${courseId}/map` },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
          <span className="whitespace-nowrap">{mockGoal.timeBudgetMinutes} minutes available</span>
          <span className="whitespace-nowrap">· {totalConcepts} concepts</span>
          <span className="whitespace-nowrap">· {completedConcepts} completed</span>
        </div>

        <p className="max-w-2xl truncate font-serif text-xs italic text-ink-soft/70" title={mockGoal.description}>
          &ldquo;{mockGoal.description}&rdquo;
        </p>
      </header>

      <LearningRoute steps={mockRoute} />

      <ScrollProgressHint isRouteComplete={isRouteComplete} />
    </div>
  )
}
