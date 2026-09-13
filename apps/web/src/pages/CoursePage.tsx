import { useParams } from 'react-router-dom'
import { LearningRoute } from '@/components/route/LearningRoute'
import { ScrollProgressHint } from '@/components/route/ScrollProgressHint'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { Tabs } from '@/components/ui/Tabs'
import { useIsInView } from '@/hooks/useIsInView'
import { DEMO_COURSE_ID, mockCourse, mockGoal, mockRoute } from '@/data/mockCourse'

export function CoursePage() {
  const { courseId = DEMO_COURSE_ID } = useParams()
  const [bottomSentinelRef, isAtBottom] = useIsInView<HTMLDivElement>()

  const totalConcepts = mockRoute.length
  const completedConcepts = mockRoute.filter((step) => step.status === 'COMPLETE').length

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2.5 rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>
              {mockCourse.code} · {mockCourse.title}
            </Eyebrow>
            <Heading as="h1" size="page" className="mt-0.5">
              {mockGoal.label}
            </Heading>
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

      <div ref={bottomSentinelRef} aria-hidden="true" className="h-px w-full" />

      <ScrollProgressHint isAtBottom={isAtBottom} />
    </div>
  )
}
