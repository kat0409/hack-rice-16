import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { FileText, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { mockSources } from '@/data/mockCourse'
import type { SourceFile } from '@/types/course'
import { cn } from '@/lib/cn'

const PIPELINE: SourceFile['status'][] = ['UPLOADED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'EXTRACTING', 'RESOLVING', 'READY']

const STATUS_LABEL: Record<SourceFile['status'], string> = {
  UPLOADED: 'Uploaded',
  PARSING: 'Parsing',
  CHUNKING: 'Chunking',
  EMBEDDING: 'Embedding',
  EXTRACTING: 'Extracting concepts',
  RESOLVING: 'Resolving graph',
  READY: 'Ready',
  FAILED: 'Failed',
}

function fileTypeFromName(name: string): SourceFile['fileType'] {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'PDF'
  if (ext === 'docx') return 'DOCX'
  if (ext === 'md') return 'MD'
  return 'TXT'
}

export function SourcesPage() {
  const [sources, setSources] = useState<SourceFile[]>(mockSources)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const ingest = (files: FileList | null) => {
    if (!files || files.length === 0) return

    Array.from(files).forEach((file, offset) => {
      const id = `upload-${Date.now()}-${offset}`
      const source: SourceFile = {
        id,
        name: file.name,
        fileType: fileTypeFromName(file.name),
        status: 'UPLOADED',
        dateAdded: new Date().toISOString(),
      }
      setSources((prev) => [source, ...prev])

      // Preview-only pipeline simulation — the real ingestion endpoint
      // (POST /api/v1/courses/{course_id}/documents) is being wired up
      // server-side; this just previews what polling its job status will feel like.
      PIPELINE.slice(1).forEach((status, index) => {
        window.setTimeout(
          () => {
            setSources((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
          },
          (index + 1) * 650,
        )
      })
    })
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    ingest(event.target.files)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    ingest(event.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>Sources</Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          From your course
        </Heading>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          isDragging ? 'border-accent bg-accent-soft' : 'border-ink/20 bg-paper-dark hover:border-ink/35',
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-accent shadow-chunky-sm">
          <Upload className="h-4.5 w-4.5" strokeWidth={1.75} />
        </span>
        <Heading as="p" size="concept">
          Drop a PDF, Markdown, or text file here
        </Heading>
        <p className="text-xs text-ink-soft">or click to browse · notes get chunked, embedded, and folded into your knowledge map</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt,.docx"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <ul className="flex flex-col gap-3">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex items-center gap-4 rounded-xl border-2 border-ink/10 bg-paper px-4 py-3 shadow-chunky-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper-dark text-ink-soft">
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
              {STATUS_LABEL[source.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
