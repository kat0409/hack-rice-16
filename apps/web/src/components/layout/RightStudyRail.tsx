import { mockRoute } from '@/data/mockCourse'
import { activityLabel } from '@/lib/activity'

export function RightStudyRail() {
  const activeStep = mockRoute.find((step) => step.status === 'ACTIVE')

  return (
    <aside className="sticky top-6 my-6 mr-6 hidden h-fit w-[320px] shrink-0 flex-col gap-4 rounded-2xl border border-border/70 bg-paper/70 p-5 shadow-soft lg:flex">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-widest2 text-ink-soft/70">Study Deck</p>
      </div>

      {activeStep ? (
        <div className="flex flex-col gap-3 border-l-2 border-accent/40 pl-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest2 text-accent">Now studying</p>
            <h3 className="mt-0.5 font-display text-base font-semibold text-ink">{activeStep.conceptName}</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              {activeStep.allocatedMinutes} min · {activityLabel(activeStep.activityType)}
            </p>
          </div>
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="mx-auto max-w-[200px] text-sm leading-relaxed text-ink-soft">
              Flashcards and practice for this concept will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <p className="mx-auto max-w-[220px] text-sm leading-relaxed text-ink-soft">
            Select a concept on your learning path to view its study deck.
          </p>
        </div>
      )}
    </aside>
  )
}
