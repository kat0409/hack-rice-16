import { BookOpen } from 'lucide-react'

export function MaterialsPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-dark/50 text-ink-soft">
        <BookOpen className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest2 text-ink-soft/60">Study Materials</p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Summaries, flashcards & questions</h2>
      </div>
      <p className="max-w-md text-sm text-ink-soft">
        Generated study materials will collect here once flashcards and practice questions are wired up.
      </p>
    </div>
  )
}
