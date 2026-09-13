import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { PreviewBanner } from '@/components/ui/PreviewBanner'
import { mockCourse } from '@/data/mockCourse'
import { mockPracticeQuestions } from '@/data/mockStudyMaterials'
import { cn } from '@/lib/cn'

export function PracticePage() {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState({ correct: 0, answered: 0 })

  const question = mockPracticeQuestions[index]
  const isLast = index === mockPracticeQuestions.length - 1

  const choose = (optionIndex: number) => {
    if (selected !== null) return
    setSelected(optionIndex)
    setScore((prev) => ({
      correct: prev.correct + (optionIndex === question.correctIndex ? 1 : 0),
      answered: prev.answered + 1,
    }))
  }

  const next = () => {
    setSelected(null)
    setIndex((prev) => (prev + 1) % mockPracticeQuestions.length)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>
          {mockCourse.code} · {mockCourse.title}
        </Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          Practice
        </Heading>
      </header>

      <PreviewBanner>
        Questions aren&apos;t generated from your notes yet — this demo set shows how grading and explanations will feel.
      </PreviewBanner>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Eyebrow as="div" className="flex items-center justify-between">
          <span>
            Question {index + 1} of {mockPracticeQuestions.length}
          </span>
          <span>
            Score {score.correct}/{score.answered}
          </span>
        </Eyebrow>

        <div className="rounded-2xl border-2 border-ink/10 bg-paper p-6 shadow-chunky">
          <Heading as="p" size="section">
            {question.prompt}
          </Heading>

          <div className="mt-5 flex flex-col gap-2.5">
            {question.options.map((option, optionIndex) => {
              const isCorrect = optionIndex === question.correctIndex
              const isChosen = optionIndex === selected
              const revealed = selected !== null

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => choose(optionIndex)}
                  disabled={revealed}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors',
                    !revealed && 'border-ink/10 bg-paper-dark text-ink hover:border-accent/40 hover:bg-accent-soft',
                    revealed && isCorrect && 'border-emerald-600/40 bg-emerald-50 text-emerald-900',
                    revealed && isChosen && !isCorrect && 'border-red-500/40 bg-red-50 text-red-900',
                    revealed && !isCorrect && !isChosen && 'border-ink/10 bg-paper-dark text-ink-soft/60',
                  )}
                >
                  <span>{option}</span>
                  {revealed && isCorrect && <Check className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2.5} />}
                  {revealed && isChosen && !isCorrect && <X className="h-4 w-4 shrink-0 text-red-600" strokeWidth={2.5} />}
                </button>
              )
            })}
          </div>

          {selected !== null && (
            <div className="mt-5 flex flex-col gap-3 border-t-2 border-dashed border-ink/10 pt-4">
              <p className="text-sm leading-relaxed text-ink-soft">{question.explanation}</p>
              <p className="text-xs italic text-ink-soft/60">{question.source}</p>
              <Button size="sm" onClick={next} className="self-start">
                {isLast ? 'Restart set' : 'Next question'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
