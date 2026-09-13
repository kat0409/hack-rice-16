import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { GraphEdge, GraphNode } from '@/types/graph'
import { computeGraphLayout } from '@/lib/graphLayout'
import { NODE_TYPE_STYLE, RELATION_STYLE } from '@/lib/graphTheme'
import { GraphNodeBubble } from './GraphNodeBubble'
import { GraphEdgeLine } from './GraphEdgeLine'
import { GraphDetailCard } from './GraphDetailCard'
import { cn } from '@/lib/cn'
import { Eyebrow } from '@/components/ui/Eyebrow'

type GraphCanvasProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const MIN_ZOOM = 0.55
const MAX_ZOOM = 1.8

function nodeRadius(node: GraphNode) {
  return (64 + node.importance * 34) / 2
}

export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  const layout = useMemo(() => computeGraphLayout(nodes, edges), [nodes, edges])
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 })
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const fitToView = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { clientWidth, clientHeight } = container
    const padding = 48
    const scale = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min((clientWidth - padding * 2) / layout.width, (clientHeight - padding * 2) / layout.height)),
    )
    setView({
      x: (clientWidth - layout.width * scale) / 2,
      y: (clientHeight - layout.height * scale) / 2,
      scale,
    })
  }, [layout])

  useLayoutEffect(() => {
    fitToView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  const focusNode = useCallback(
    (id: string) => {
      const point = layout.points.get(id)
      const container = containerRef.current
      if (point && container) {
        const { clientWidth, clientHeight } = container
        setView((prev) => ({
          ...prev,
          x: clientWidth / 2 - point.x * prev.scale,
          y: clientHeight / 2 - point.y * prev.scale,
        }))
      }
      setSelectedId(id)
    },
    [layout],
  )

  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null

  const neighborIds = useMemo(() => {
    if (!selectedId) return null
    const set = new Set<string>([selectedId])
    for (const edge of edges) {
      if (edge.source === selectedId) set.add(edge.target)
      if (edge.target === selectedId) set.add(edge.source)
    }
    return set
  }, [selectedId, edges])

  const activeEdgeIds = useMemo(() => {
    if (!selectedId) return null
    return new Set(edges.filter((edge) => edge.source === selectedId || edge.target === selectedId).map((e) => e.id))
  }, [selectedId, edges])

  const connectedForCard = useMemo(() => {
    if (!selectedNode) return []
    type Connected = { edge: GraphEdge; other: GraphNode; direction: 'outgoing' | 'incoming' }
    return edges.flatMap((edge): Connected[] => {
      if (edge.source === selectedNode.id) {
        const other = nodesById.get(edge.target)
        return other ? [{ edge, other, direction: 'outgoing' }] : []
      }
      if (edge.target === selectedNode.id) {
        const other = nodesById.get(edge.source)
        return other ? [{ edge, other, direction: 'incoming' }] : []
      }
      return []
    })
  }, [selectedNode, edges, nodesById])

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    setView((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale - event.deltaY * 0.001))
      return { ...prev, scale: next }
    })
  }, [])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    dragState.current = { startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [view.x, view.y])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const { startX, startY, originX, originY } = dragState.current
    setView((prev) => ({ ...prev, x: originX + (event.clientX - startX), y: originY + (event.clientY - startY) }))
  }, [])

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setView((prev) => ({ ...prev, scale: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale * factor)) }))
  }, [])

  const resetView = useCallback(() => {
    setSelectedId(null)
    fitToView()
  }, [fitToView])

  return (
    <div
      ref={containerRef}
      className="graph-paper relative h-[62vh] min-h-[440px] w-full overflow-clip rounded-2xl border-2 border-ink/15 shadow-chunky"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          transition: isPanning ? 'none' : 'transform 0.4s ease',
        }}
      >
        <svg
          className="absolute left-0 top-0 overflow-visible"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <defs>
            <filter id="pencil-wobble" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.035" numOctaves={2} seed={3} result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={2.6} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            {Object.entries(RELATION_STYLE).map(([type, style]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                viewBox="0 0 10 10"
                refX={8}
                refY={5}
                markerWidth={7}
                markerHeight={7}
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 L 2.5 5 Z" fill={style.color} />
              </marker>
            ))}
          </defs>

          {edges.map((edge) => {
            const from = layout.points.get(edge.source)
            const to = layout.points.get(edge.target)
            const fromNode = nodesById.get(edge.source)
            const toNode = nodesById.get(edge.target)
            if (!from || !to || !fromNode || !toNode) return null
            const active = activeEdgeIds?.has(edge.id) ?? false
            const dimmed = selectedId !== null
            return (
              <GraphEdgeLine
                key={edge.id}
                edge={edge}
                from={from}
                to={to}
                fromRadius={nodeRadius(fromNode)}
                toRadius={nodeRadius(toNode)}
                active={active}
                dimmed={dimmed}
              />
            )
          })}
        </svg>

        {nodes.map((node) => {
          const point = layout.points.get(node.id)
          if (!point) return null
          const dimmed = neighborIds !== null && !neighborIds.has(node.id)
          return (
            <div key={node.id} style={{ position: 'absolute', left: point.x, top: point.y }}>
              <GraphNodeBubble
                node={node}
                size={nodeRadius(node) * 2}
                selected={selectedId === node.id}
                dimmed={dimmed}
                onSelect={() => (selectedId === node.id ? setSelectedId(null) : focusNode(node.id))}
              />
            </div>
          )
        })}
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border-2 border-ink/15 bg-paper p-1 shadow-chunky-sm">
          <button
            type="button"
            onClick={() => zoomBy(1.15)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.15)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
            aria-label="Reset view"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-20 hidden max-w-[190px] flex-col gap-1.5 rounded-xl border-2 border-ink/15 bg-paper px-3 py-2.5 shadow-chunky-sm sm:flex">
        <Eyebrow size="card">Legend</Eyebrow>
        <ul className="flex flex-col gap-1">
          {Object.values(NODE_TYPE_STYLE).map((style) => (
            <li key={style.label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: style.soft }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />
              </span>
              {style.label}
            </li>
          ))}
        </ul>
      </div>

      {selectedNode && (
        <GraphDetailCard
          node={selectedNode}
          connected={connectedForCard}
          onClose={() => setSelectedId(null)}
          onSelectNode={focusNode}
        />
      )}

      <p
        className={cn(
          'pointer-events-none absolute left-4 top-3 z-10 text-[11px] italic text-ink-soft/50 transition-opacity',
          selectedId && 'opacity-0',
        )}
      >
        Drag to pan · scroll to zoom · tap a bubble
      </p>
    </div>
  )
}
