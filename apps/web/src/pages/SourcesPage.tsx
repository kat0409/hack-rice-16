import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { api, type DocumentDto } from '@/lib/api'
import type { SourceFile } from '@/types/course'
import { cn } from '@/lib/cn'

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

const NON_TERMINAL: ReadonlySet<SourceFile['status']> = new Set([
  'UPLOADED',
  'PARSING',
  'CHUNKING',
  'EMBEDDING',
  'EXTRACTING',
  'RESOLVING',
])

const POLL_INTERVAL_MS = 1500

function fileTypeFromName(name: string): SourceFile['fileType'] {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'PDF'
  if (ext === 'docx') return 'DOCX'
  if (ext === 'md') return 'MD'
  return 'TXT'
}

function mapDocumentToSource(doc: DocumentDto): SourceFile {
  return {
    id: doc.id,
    name: doc.filename,
    fileType: fileTypeFromName(doc.filename),
    status: doc.status,
    pageCount: doc.page_count ?? undefined,
    dateAdded: doc.created_at,
    errorCode: doc.error_code ?? undefined,
    errorMessage: doc.error_message ?? undefined,
  }
}

function mergeDocuments(prev: SourceFile[], items: DocumentDto[]): SourceFile[] {
  const byId = new Map(items.map((doc) => [doc.id, doc]))
  const knownIds = new Set(prev.map((source) => source.id))
  const updated = prev.map((source) => {
    const doc = byId.get(source.id)
    return doc ? mapDocumentToSource(doc) : source
  })
  const additions = items.filter((doc) => !knownIds.has(doc.id)).map(mapDocumentToSource)
  return [...additions, ...updated]
}

export function SourcesPage() {
  const { courseId } = useParams()
  const [sources, setSources] = useState<SourceFile[]>([])
  const [ocrEnabled, setOcrEnabled] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pollHandle = useRef<number | null>(null)

  const stopPolling = () => {
    if (pollHandle.current !== null) {
      window.clearInterval(pollHandle.current)
      pollHandle.current = null
    }
  }

  const refreshDocuments = async (cid: string) => {
    const { items } = await api.listDocuments(cid)
    setSources((prev) => mergeDocuments(prev, items))
    if (items.some((doc) => NON_TERMINAL.has(doc.status))) {
      ensurePolling(cid)
    } else {
      stopPolling()
    }
  }

  const ensurePolling = (cid: string) => {
    if (pollHandle.current !== null) return
    pollHandle.current = window.setInterval(() => {
      refreshDocuments(cid).catch(console.error)
    }, POLL_INTERVAL_MS)
  }

  useEffect(() => {
    if (!courseId) return
    refreshDocuments(courseId).catch(console.error)
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  const ingest = async (files: FileList | null) => {
    if (!files || files.length === 0 || !courseId) return

    try {
      const res = await api.uploadDocuments(courseId, Array.from(files), ocrEnabled)
      const uploadedSources = res.uploaded.map((u) => mapDocumentToSource(u.document))
      const rejectedSources: SourceFile[] = res.rejected.map((r, index) => ({
        id: `rejected-${Date.now()}-${index}`,
        name: r.filename,
        fileType: fileTypeFromName(r.filename),
        status: 'FAILED',
        dateAdded: new Date().toISOString(),
        errorCode: r.code,
        errorMessage: r.message,
      }))
      setSources((prev) => [...uploadedSources, ...rejectedSources, ...prev])
      ensurePolling(courseId)
    } catch (err) {
      console.error(err)
    }
  }

  const retryExtraction = async (documentId: string) => {
    if (!courseId) return
    try {
      await api.rerunExtraction(documentId)
      setSources((prev) =>
        prev.map((s) => (s.id === documentId ? { ...s, status: 'EXTRACTING', errorCode: undefined } : s)),
      )
      ensurePolling(courseId)
    } catch (err) {
      console.error(err)
    }
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
        <Heading as="h1" size="page" className="mt-1 font-retro font-normal">
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

      <label className="flex items-start gap-2 text-sm" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={ocrEnabled}
          onChange={(event) => setOcrEnabled(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          <strong>Read scanned or handwritten PDFs</strong>
          <br />
          <span className="text-xs text-ink-soft">
            Files without selectable text can only be read by sending pictures of their
            pages to the model provider for transcription. That is more than the text
            excerpts normally sent. Off by default.
          </span>
        </span>
      </label>

      <ul className="flex flex-col gap-3">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex flex-col gap-2 rounded-xl border-2 border-ink/10 bg-paper px-4 py-3 shadow-chunky-sm"
          >
            <div className="flex items-center gap-4">
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
            </div>
            {source.status === 'FAILED' && source.errorCode === 'PARSE_EMPTY' && (
              <p className="rounded-lg bg-paper-dark px-3 py-2 text-xs text-ink-soft">
                This file has no selectable text. Enable the scanned-PDF option above and
                upload it again.
              </p>
            )}
            {source.status === 'FAILED' && source.errorCode !== 'PARSE_EMPTY' && source.errorMessage && (
              <p className="rounded-lg bg-paper-dark px-3 py-2 text-xs text-ink-soft">
                {source.errorMessage}
              </p>
            )}
            {source.status === 'EMBEDDING' && source.errorCode && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper-dark px-3 py-2 text-xs text-ink-soft">
                <span>Your notes are saved, but concept extraction failed: {source.errorMessage}</span>
                <button
                  type="button"
                  className="font-semibold text-accent hover:underline"
                  onClick={() => retryExtraction(source.id)}
                >
                  Retry extraction
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
