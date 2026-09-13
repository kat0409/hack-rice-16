import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { mockSources } from '@/data/mockCourse'

export function SourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest2 text-ink-soft/60">Sources</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">From your course</h1>
      </header>

      <ul className="flex flex-col gap-3">
        {mockSources.map((source) => (
          <li
            key={source.id}
            className="flex items-center gap-4 rounded-xl border border-border/70 bg-paper/70 px-4 py-3 shadow-soft"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper-dark/50 text-ink-soft">
              <FileText className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{source.name}</p>
              <p className="text-xs text-ink-soft">
                {source.fileType}
                {source.pageCount ? ` · ${source.pageCount} pages` : ''} · Added{' '}
                {new Date(source.dateAdded).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={source.status === 'READY' ? 'accent' : 'outline'}>
              {source.status === 'READY' ? 'Ready' : source.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
