import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { GraphEdge, GraphNode, GraphNodeType } from '@/types/graph'
import { computeGraphLayout, type GraphPoint } from '@/lib/graphLayout'
import { RELATION_STYLE } from '@/lib/graphTheme'
import { cn } from '@/lib/cn'
import { GraphNodeBubble } from './GraphNodeBubble'
import { GraphEdgeLine } from './GraphEdgeLine'
import { GraphDetailCard } from './GraphDetailCard'
import { GraphToolbar } from './GraphToolbar'
import { useGraphViewport, type Bounds } from './useGraphViewport'

type GraphCanvasProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  focusId?: string | null
}

const LABEL_MIN_SCALE = 0.45
const DRAG_THRESHOLD = 4
const KEY_PAN = 90
const DETAIL_CARD_WIDTH = 336
const FOCUS_MIN_SCALE = 0.85
// Automatic fits never shrink below this, so names stay legible; the Fit button still shows everything.
const READABLE_FIT_SCALE = 0.5
// Touch: a drag starting on a bubble pans the map; holding this long picks the bubble up instead.
const LONG_PRESS_MS = 350

function nodeRadius(node: GraphNode) {
  return (64 + node.importance * 34) / 2
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

type NodeDrag = {
  id: string
  el: HTMLElement
  pointerId: number
  startX: number
  startY: number
  origin: GraphPoint
  moved: boolean
  // Touch only: true until a long press arms the drag; while pending, movement pans.
  pendingTouch: boolean
  timer: number | null
}

export function GraphCanvas({ nodes, edges, focusId = null }: GraphCanvasProps) {
  const layout = useMemo(() => computeGraphLayout(nodes, edges), [nodes, edges])
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const structureKey = useMemo(() => nodes.map((n) => n.id).sort().join('|'), [nodes])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hiddenTypes, setHiddenTypes] = useState<Set<GraphNodeType>>(() => new Set())
  const [overrides, setOverrides] = useState<Record<string, GraphPoint>>({})
  const [fullscreen, setFullscreen] = useState(false)
  const [showHint, setShowHint] = useState(true)

  const searchRef = useRef<HTMLInputElement | null>(null)
  const nodeDrag = useRef<NodeDrag | null>(null)
  const suppressClick = useRef<string | null>(null)
  const handledFocus = useRef<string | null>(null)

  const clearSelection = useCallback(() => setSelectedId(null), [])
  const viewport = useGraphViewport({ onBackgroundTap: clearSelection })
  const { view, viewRef, fitBounds, setAutoFit, centerOn, size, markInteraction } = viewport

  const positions = useMemo(() => {
    if (Object.keys(overrides).length === 0) return layout.points
    const merged = new Map(layout.points)
    for (const [id, point] of Object.entries(overrides)) {
      if (merged.has(id)) merged.set(id, point)
    }
    return merged
  }, [layout, overrides])

  const visibleNodes = useMemo(() => nodes.filter((node) => !hiddenTypes.has(node.type)), [nodes, hiddenTypes])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [edges, visibleIds],
  )

  const typeCounts = useMemo(() => {
    const counts = new Map<GraphNodeType, number>()
    for (const node of nodes) counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [nodes])

  const bounds = useCallback((): Bounds | null => {
    const points = visibleNodes.map((node) => positions.get(node.id)).filter((p): p is GraphPoint => !!p)
    if (points.length === 0) return null
    return {
      minX: Math.min(...points.map((p) => p.x)) - 110,
      maxX: Math.max(...points.map((p) => p.x)) + 110,
      minY: Math.min(...points.map((p) => p.y)) - 70,
      maxY: Math.max(...points.map((p) => p.y)) + 90,
    }
  }, [positions, visibleNodes])

  const fit = useCallback(
    (animate: boolean, minScale?: number) => {
      const b = bounds()
      if (b) fitBounds(b, animate, minScale)
    },
    [bounds, fitBounds],
  )

  useEffect(() => {
    setAutoFit(() => fit(false, READABLE_FIT_SCALE))
  }, [fit, setAutoFit])

  // Fit when the set of concepts changes, unless the user has already moved the
  // view. Polling returns the same graph repeatedly; that must not reset the view.
  useLayoutEffect(() => {
    if (!viewport.isInteracted()) fit(false, READABLE_FIT_SCALE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey])

  const focusNode = useCallback(
    (id: string) => {
      const point = positions.get(id)
      if (point) {
        const { width, height } = size()
        // Keep the node clear of the detail card that opens bottom-left.
        const wide = width >= 700
        const sx = wide ? DETAIL_CARD_WIDTH + (width - DETAIL_CARD_WIDTH) / 2 : width / 2
        const sy = wide ? height / 2 : height * 0.32
        centerOn(point.x, point.y, sx, sy, FOCUS_MIN_SCALE)
      }
      setSelectedId(id)
    },
    [centerOn, positions, size],
  )

  useEffect(() => {
    if (!focusId || handledFocus.current === focusId) return
    const node = nodesById.get(focusId)
    if (!node) return
    // Mark handled only once focus actually runs: StrictMode's mount/cleanup/remount
    // cycle would otherwise cancel the frame and then skip the retry.
    const frame = requestAnimationFrame(() => {
      handledFocus.current = focusId
      setHiddenTypes((prev) => {
        if (!prev.has(node.type)) return prev
        const next = new Set(prev)
        next.delete(node.type)
        return next
      })
      focusNode(focusId)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusId, focusNode, nodesById])

  const onSelectNode = useCallback(
    (id: string) => {
      if (suppressClick.current === id) {
        suppressClick.current = null
        return
      }
      if (selectedId === id) setSelectedId(null)
      else focusNode(id)
    },
    [focusNode, selectedId],
  )

  const pickFromSearch = useCallback(
    (node: GraphNode) => {
      setHiddenTypes((prev) => {
        if (!prev.has(node.type)) return prev
        const next = new Set(prev)
        next.delete(node.type)
        return next
      })
      focusNode(node.id)
    },
    [focusNode],
  )

  const toggleType = useCallback(
    (type: GraphNodeType) => {
      setHiddenTypes((prev) => {
        const next = new Set(prev)
        if (next.has(type)) next.delete(type)
        else next.add(type)
        return next
      })
      if (selectedId && nodesById.get(selectedId)?.type === type) setSelectedId(null)
    },
    [nodesById, selectedId],
  )

  const onNodePointerDown = (id: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const origin = positions.get(id)
    if (!origin) return
    const touch = event.pointerType === 'touch'
    const drag: NodeDrag = {
      id,
      el: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      moved: false,
      pendingTouch: touch,
      timer: null,
    }
    if (touch) {
      // Pan by default; the viewport receives this pointer's moves as they bubble up.
      viewport.handlers.onPointerDown(event, true)
      drag.timer = window.setTimeout(() => {
        if (nodeDrag.current !== drag || viewport.hasMultiTouch()) return
        drag.pendingTouch = false
        drag.timer = null
        viewport.releasePointer(drag.pointerId)
        navigator.vibrate?.(12)
      }, LONG_PRESS_MS)
    }
    // No pointer capture yet: capturing here would retarget the click to this
    // wrapper and the bubble button would never receive it.
    nodeDrag.current = drag
  }

  const endNodeDrag = (drag: NodeDrag) => {
    if (drag.timer !== null) window.clearTimeout(drag.timer)
    if (nodeDrag.current === drag) nodeDrag.current = null
  }

  const onNodePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = nodeDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget !== drag.el) {
      if (!drag.moved) endNodeDrag(drag)
      return
    }
    if (event.buttons === 0) {
      endNodeDrag(drag)
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.pendingTouch) {
      // Moved before the long press fired: this is a pan, handled by the viewport.
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) endNodeDrag(drag)
      return
    }
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.stopPropagation()
    markInteraction()
    const scale = viewRef.current.scale
    setOverrides((prev) => ({
      ...prev,
      [drag.id]: { ...drag.origin, x: drag.origin.x + dx / scale, y: drag.origin.y + dy / scale },
    }))
  }

  const onNodePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = nodeDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    endNodeDrag(drag)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved) {
      // A drag must not also count as a click; clear afterwards in case no click follows.
      suppressClick.current = drag.id
      window.setTimeout(() => {
        if (suppressClick.current === drag.id) suppressClick.current = null
      }, 0)
    }
  }

  const resetLayout = useCallback(() => {
    setOverrides({})
    viewport.resetInteraction()
    requestAnimationFrame(() => fit(true))
  }, [fit, viewport])

  const fitNow = useCallback(() => {
    viewport.resetInteraction()
    fit(true)
  }, [fit, viewport])

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), [])

  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [fullscreen])

  const previousFullscreen = useRef(fullscreen)
  useEffect(() => {
    // Compare with the previous value rather than skipping the first run, which
    // StrictMode's double-invoked effects would defeat (focusing on page load).
    if (previousFullscreen.current === fullscreen) return
    previousFullscreen.current = fullscreen
    // The canvas remounts when it moves in or out of the portal; keep keyboard focus on it.
    const frame = requestAnimationFrame(() => viewport.containerRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const container = viewport.containerRef.current
      const scoped = fullscreen || (!!container && container.contains(document.activeElement))
      if (!scoped || event.metaKey || event.altKey || (event.ctrlKey && event.key !== '0')) return

      if (event.key === 'Escape') {
        if (isTypingTarget(event.target)) return
        if (selectedId) setSelectedId(null)
        else if (fullscreen) setFullscreen(false)
        else return
        event.preventDefault()
        return
      }
      if (isTypingTarget(event.target)) return

      const handled = (() => {
        switch (event.key) {
          case 'f':
          case 'F':
            toggleFullscreen()
            return true
          case '/':
            searchRef.current?.focus()
            return true
          case '+':
          case '=':
            viewport.zoomCenter(1.25)
            return true
          case '-':
          case '_':
            viewport.zoomCenter(1 / 1.25)
            return true
          case '0':
            fitNow()
            return true
          case 'ArrowLeft':
            viewport.panBy(KEY_PAN, 0, true)
            return true
          case 'ArrowRight':
            viewport.panBy(-KEY_PAN, 0, true)
            return true
          case 'ArrowUp':
            viewport.panBy(0, KEY_PAN, true)
            return true
          case 'ArrowDown':
            viewport.panBy(0, -KEY_PAN, true)
            return true
          default:
            return false
        }
      })()
      if (handled) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fitNow, fullscreen, selectedId, toggleFullscreen, viewport])

  const selectedNode = selectedId && visibleIds.has(selectedId) ? (nodesById.get(selectedId) ?? null) : null

  const neighborIds = useMemo(() => {
    if (!selectedNode) return null
    const set = new Set<string>([selectedNode.id])
    for (const edge of visibleEdges) {
      if (edge.source === selectedNode.id) set.add(edge.target)
      if (edge.target === selectedNode.id) set.add(edge.source)
    }
    return set
  }, [selectedNode, visibleEdges])

  const connectedForCard = useMemo(() => {
    if (!selectedNode) return []
    type Connected = { edge: GraphEdge; other: GraphNode; direction: 'outgoing' | 'incoming' }
    return visibleEdges.flatMap((edge): Connected[] => {
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
  }, [selectedNode, visibleEdges, nodesById])

  const lowDetail = viewport.interacting
  const labelsByZoom = view.scale >= LABEL_MIN_SCALE

  const canvas = (
    <div
      ref={viewport.bindContainer}
      tabIndex={0}
      aria-label="Knowledge map. Drag to pan, scroll to zoom, F for fullscreen, / to search."
      {...viewport.handlers}
      onPointerDownCapture={() => setShowHint(false)}
      onWheelCapture={() => setShowHint(false)}
      onKeyDownCapture={() => setShowHint(false)}
      className={cn(
        'graph-paper relative w-full touch-none select-none overflow-clip border-2 border-ink/15 outline-none focus-visible:border-accent',
        fullscreen ? 'h-full rounded-none' : 'h-[calc(100vh-15rem)] min-h-[460px] rounded-2xl shadow-chunky',
        viewport.interacting ? 'cursor-grabbing' : 'cursor-grab',
      )}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          transition: viewport.animated ? 'transform 0.35s ease' : 'none',
          willChange: 'transform',
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

          {visibleEdges.map((edge) => {
            const from = positions.get(edge.source)
            const to = positions.get(edge.target)
            const fromNode = nodesById.get(edge.source)
            const toNode = nodesById.get(edge.target)
            if (!from || !to || !fromNode || !toNode) return null
            const active = !!selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id)
            return (
              <GraphEdgeLine
                key={edge.id}
                edge={edge}
                from={from}
                to={to}
                fromRadius={nodeRadius(fromNode)}
                toRadius={nodeRadius(toNode)}
                active={active}
                dimmed={!!selectedNode}
                lowDetail={lowDetail}
              />
            )
          })}
        </svg>

        {visibleNodes.map((node) => {
          const point = positions.get(node.id)
          if (!point) return null
          const selected = selectedNode?.id === node.id
          const related = neighborIds?.has(node.id) ?? false
          return (
            <div
              key={node.id}
              data-graph-node
              style={{ position: 'absolute', left: point.x, top: point.y, zIndex: selected || hoveredId === node.id ? 2 : 1 }}
              onPointerDown={(event) => onNodePointerDown(node.id, event)}
              onPointerMove={onNodePointerMove}
              onPointerUp={onNodePointerUp}
              onPointerCancel={onNodePointerUp}
              onPointerEnter={() => setHoveredId(node.id)}
              onPointerLeave={() => setHoveredId((current) => (current === node.id ? null : current))}
              onContextMenu={(event) => event.preventDefault()}
            >
              <GraphNodeBubble
                node={node}
                size={nodeRadius(node) * 2}
                selected={selected}
                dimmed={neighborIds !== null && !related}
                showLabel={labelsByZoom || selected || related || hoveredId === node.id}
                lowDetail={lowDetail}
                onSelect={onSelectNode}
              />
            </div>
          )
        })}
      </div>

      <GraphToolbar
        nodes={nodes}
        searchRef={searchRef}
        onPick={pickFromSearch}
        typeCounts={typeCounts}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleType}
        onShowAll={() => setHiddenTypes(new Set())}
        onZoomIn={() => viewport.zoomCenter(1.25)}
        onZoomOut={() => viewport.zoomCenter(1 / 1.25)}
        onFit={fitNow}
        hasMovedNodes={Object.keys(overrides).length > 0}
        onResetLayout={resetLayout}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        compact={viewport.width > 0 && viewport.width < 560}
      />

      {selectedNode && (
        <div data-graph-ui>
          <GraphDetailCard
            node={selectedNode}
            connected={connectedForCard}
            onClose={() => setSelectedId(null)}
            onSelectNode={focusNode}
          />
        </div>
      )}

      {visibleNodes.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-soft">
          Every type is filtered out. Turn one back on above.
        </p>
      )}

      {showHint && !selectedNode && (
        <p className="pointer-events-none absolute bottom-3 right-3 z-10 hidden rounded-full border-2 border-ink/10 bg-paper px-3 py-1 text-[11px] text-ink-soft shadow-chunky-sm md:block">
          Drag to pan · scroll or pinch to zoom · drag a bubble to move it · <kbd>/</kbd> search · <kbd>F</kbd>{' '}
          fullscreen
        </p>
      )}
    </div>
  )

  if (!fullscreen) return canvas

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Knowledge map, fullscreen" className="fixed inset-0 z-50 bg-paper">
      {canvas}
    </div>,
    document.body,
  )
}
