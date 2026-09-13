import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Layers, Mic, Target } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { DEMO_COURSE_ID, mockCourse } from '@/data/mockCourse'

const materials = [
  {
    key: 'flashcards',
    label: 'Flashcards',
    icon: Layers,
    description: 'Front-and-back cards generated from your notes, ready to flip through.',
    to: (id: string) => `/course/${id}/flashcards`,
  },
  {
    key: 'practice',
    label: 'Practice Questions',
    icon: Target,
    description: 'Multiple-choice checks with explanations grounded in your sources.',
    to: (id: string) => `/course/${id}/practice`,
  },
  {
    key: 'audio',
    label: 'Audio Recap',
    icon: Mic,
    description: 'A narrated summary of this unit, plus upload-to-transcribe for your own recordings.',
    to: (id: string) => `/course/${id}/audio`,
  },
]

export function MaterialsPage() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>
          {mockCourse.code} · {mockCourse.title}
        </Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          Study Materials
        </Heading>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Summaries, flashcards, and practice questions generated from your notes collect here.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {materials.map((item) => (
          <Link
            key={item.key}
            to={item.to(courseId)}
            className="group flex flex-col gap-3 rounded-2xl border-2 border-ink/10 bg-paper p-5 shadow-chunky transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <item.icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <Badge variant="outline">Preview</Badge>
            </div>
            <Heading as="h2" size="section">
              {item.label}
            </Heading>
            <p className="text-sm text-ink-soft">{item.description}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent">
              Open preview
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
