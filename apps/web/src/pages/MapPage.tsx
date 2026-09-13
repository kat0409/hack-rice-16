import { useParams } from 'react-router-dom'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { Tabs } from '@/components/ui/Tabs'
import { DEMO_COURSE_ID, mockCourse } from '@/data/mockCourse'
import { mockGraphEdges, mockGraphNodes } from '@/data/mockGraph'

export function MapPage() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2.5 rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>
              {mockCourse.code} · {mockCourse.title}
            </Eyebrow>
            <Heading as="h1" size="page" className="mt-0.5">
              Knowledge Map
            </Heading>
          </div>
          <Tabs
            items={[
              { key: 'path', label: 'Path', to: `/course/${courseId}/path` },
              { key: 'map', label: 'Map', to: `/course/${courseId}/map` },
            ]}
          />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          How your concepts connect — prerequisites flow left to right, sketched from what your sources actually say.
        </p>
      </header>

      <GraphCanvas nodes={mockGraphNodes} edges={mockGraphEdges} />
    </div>
  )
}
