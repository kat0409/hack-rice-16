import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { StepPicker } from '@/components/study/StepPicker'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { useArtifact } from '@/hooks/useArtifact'
import { useCourse } from '@/hooks/useCourse'
import { useStep } from '@/hooks/useStep'
import type { FlashcardsContent } from '@/lib/api'
import { cn } from '@/lib/cn'

export function FlashcardsPage() {
  const { courseId = '' } = useParams()
  const { course } = useCourse(courseId)
  const { step, steps, loading: stepLoading, select } = useStep(courseId)
  const { artifact, loading, error } = useArtifact<FlashcardsContent>(step?.id, 'FLASHCARDS')
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFlipped(false)
  }, [artifact?.id])

  const cards = artifact?.content.cards ?? []
  const card = cards[index]

  const go = (delta: number) => {
    setFlipped(false)
    setIndex((prev) => (prev + delta + cards.length) % cards.length)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>{course?.name ?? 'Subject'}</Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          Flashcards{step ? ` · ${step.conceptName}` : ''}
        </Heading>
      </header>

      <StepPicker courseId={courseId} steps={steps} step={step} loading={stepLoading} onSelect={select} />

      {loading && <p className="text-sm text-ink-soft">Writing cards from your notes…</p>}
      {error && <p className="text-sm text-red-700">{error.message}</p>}

      {card && (
        <div className="flex flex-col items-center gap-6 py-4">
          <Eyebrow>
            Card {index + 1} of {cards.length}
          </Eyebrow>

          <div className="w-full max-w-lg [perspective:1200px]">
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="relative h-72 w-full [transform-style:preserve-3d] transition-transform duration-500"
              style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
              aria-label="Flip card"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-ink/10 bg-paper p-8 text-center shadow-chunky [backface-visibility:hidden]">
                <Eyebrow size="card">Question</Eyebrow>
                <Heading as="p" size="page">
                  {card.front}
                </Heading>
                <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-soft/60">
                  <RotateCw className="h-3 w-3" strokeWidth={1.75} />
                  Tap to flip
                </span>
              </div>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-accent/25 bg-accent-soft p-8 text-center shadow-chunky-accent [backface-visibility:hidden]"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <Eyebrow size="card" className="text-accent-dark/70">
                  Answer
                </Eyebrow>
                <p className="font-serif text-lg leading-relaxed text-ink">{card.back}</p>
                {card.citation_labels[0] && (
                  <p className="mt-2 text-xs italic text-ink-soft/70">{card.citation_labels.join(' · ')}</p>
                )}
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => go(-1)} aria-label="Previous card">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5">
              {cards.map((c, i) => (
                <span
                  key={`${c.front}-${i}`}
                  className={cn('h-1.5 w-1.5 rounded-full', i === index ? 'bg-accent' : 'bg-border')}
                  aria-hidden="true"
                />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => go(1)} aria-label="Next card">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
