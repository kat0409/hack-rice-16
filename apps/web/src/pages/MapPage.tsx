import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { Tabs } from '@/components/ui/Tabs'
import { useCourse } from '@/hooks/useCourse'
import { api, type GraphDto } from '@/lib/api'
import { mapGraph } from '@/lib/mappers'
import type { GraphEdge, GraphNode } from '@/types/graph'

const POLL_MS = 3000

function graphSignature(graph: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  return JSON.stringify([graph.nodes, graph.edges])
}

export function MapPage() {
  const { courseId = '' } = useParams()
  const { course } = useCourse(courseId)
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const signature = useRef<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    let timer: number | null = null

    const load = async () => {
      try {
        const [dto, docs] = await Promise.all([api.getGraph(courseId), api.listDocuments(courseId)])
        if (cancelled) return
        // Polling returns the same graph over and over; only hand the canvas new
        // arrays when something actually changed, so its view isn't disturbed.
        const next = mapGraph(dto as GraphDto)
        const nextSignature = graphSignature(next)
        if (nextSignature !== signature.current) {
          signature.current = nextSignature
          setGraph(next)
        }
        const active = docs.items.some((d) => d.status !== 'READY' && d.status !== 'FAILED')
        setProcessing(active)
        if (active) timer = window.setTimeout(load, POLL_MS)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }

    load()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [courseId])

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2.5 rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>{course?.name ?? 'Subject'}</Eyebrow>
            <Heading as="h1" size="page" className="mt-0.5 font-retro font-normal">
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
          {processing && ' Sources are still processing; the map updates as they finish.'}
        </p>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {graph && graph.nodes.length > 0 ? (
        <GraphCanvas nodes={graph.nodes} edges={graph.edges} focusId={searchParams.get('focus')} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink/20 bg-paper-dark px-6 py-12 text-center">
          <Heading as="p" size="concept">
            {graph === null ? 'Loading your map…' : 'No concepts yet'}
          </Heading>
          {graph !== null && (
            <p className="max-w-md text-sm text-ink-soft">
              {processing
                ? 'Your sources are still being read. Concepts appear here as soon as extraction finishes.'
                : 'Upload notes on the Sources page and graphite will map the concepts it finds.'}
            </p>
          )}
          {graph !== null && !processing && (
            <Link to={`/course/${courseId}/sources`} className="text-sm font-semibold text-accent hover:underline">
              Go to Sources
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
