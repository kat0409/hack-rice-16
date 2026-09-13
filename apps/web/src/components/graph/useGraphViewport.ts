import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type View = { x: number; y: number; scale: number }
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 2.5
const MAX_FIT_ZOOM = 1.3
const FIT_PADDING = 40
const DRAG_THRESHOLD = 4
const IDLE_MS = 160

const clampScale = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))

/** Elements that own their own pointer/wheel behavior and must never start a pan. */
export function isInteractiveTarget(target: EventTarget | null) {
  return !!(target as Element | null)?.closest?.('[data-graph-ui],[data-graph-node]')
}

type Gesture =
  | { type: 'pan'; startX: number; startY: number; origin: View; moved: boolean; fromNode?: boolean }
  | { type: 'pinch'; startDist: number; startMid: { x: number; y: number }; origin: View }

/**
 * Pan/zoom state for the knowledge-graph canvas.
 *
 * All view changes go through `commit`, which also decides whether the world
 * transform animates: only programmatic moves (fit, focus, buttons) ease;
 * drag, wheel, and pinch track the pointer 1:1 with no transition.
 */
export function useGraphViewport({ onBackgroundTap }: { onBackgroundTap: () => void }) {
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const [animated, setAnimated] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  const viewRef = useRef(view)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const interactedRef = useRef(false)
  const idleTimer = useRef<number | null>(null)
  const lastSize = useRef<{ width: number; height: number } | null>(null)
  const autoFitRef = useRef<() => void>(() => {})
  const onTapRef = useRef(onBackgroundTap)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)

  useEffect(() => {
    onTapRef.current = onBackgroundTap
  }, [onBackgroundTap])

  const bindContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    setContainer(el)
  }, [])

  const commit = useCallback((next: View, animate: boolean) => {
    viewRef.current = next
    setAnimated(animate)
    setView(next)
  }, [])

  const markInteraction = useCallback(() => {
    interactedRef.current = true
    setInteracting(true)
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setInteracting(false), IDLE_MS)
  }, [])

  const size = useCallback(() => {
    const el = containerRef.current
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 }
  }, [])

  const local = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }, [])

  /**
   * Fit bounds into the container. With a minScale above what a full fit needs,
   * the view stays readable instead: it starts from the left edge (where the
   * prerequisite tiers begin) rather than shrinking every label to a speck.
   */
  const fitBounds = useCallback(
    (bounds: Bounds, animate: boolean, minScale = MIN_ZOOM) => {
      const { width, height } = size()
      if (!width || !height) return
      const bw = Math.max(1, bounds.maxX - bounds.minX)
      const bh = Math.max(1, bounds.maxY - bounds.minY)
      const fitScale = clampScale(Math.min((width - FIT_PADDING * 2) / bw, (height - FIT_PADDING * 2) / bh))
      const scale = Math.min(MAX_FIT_ZOOM, Math.max(fitScale, minScale))
      const fitsWidth = bw * scale <= width - FIT_PADDING * 2
      const fitsHeight = bh * scale <= height - FIT_PADDING * 2
      commit(
        {
          scale,
          x: fitsWidth
            ? width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale
            : FIT_PADDING - bounds.minX * scale,
          y: fitsHeight
            ? height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
            : FIT_PADDING + 90 - bounds.minY * scale,
        },
        animate,
      )
    },
    [commit, size],
  )

  const zoomAt = useCallback(
    (px: number, py: number, factor: number, animate: boolean) => {
      const prev = viewRef.current
      const scale = clampScale(prev.scale * factor)
      const worldX = (px - prev.x) / prev.scale
      const worldY = (py - prev.y) / prev.scale
      commit({ scale, x: px - worldX * scale, y: py - worldY * scale }, animate)
    },
    [commit],
  )

  const zoomCenter = useCallback(
    (factor: number) => {
      const { width, height } = size()
      interactedRef.current = true
      zoomAt(width / 2, height / 2, factor, true)
    },
    [size, zoomAt],
  )

  const panBy = useCallback(
    (dx: number, dy: number, animate: boolean) => {
      const prev = viewRef.current
      interactedRef.current = true
      commit({ ...prev, x: prev.x + dx, y: prev.y + dy }, animate)
    },
    [commit],
  )

  /** Put world point (wx, wy) at screen point (sx, sy), zooming in at least to minScale. */
  const centerOn = useCallback(
    (wx: number, wy: number, sx: number, sy: number, minScale: number) => {
      const scale = clampScale(Math.max(viewRef.current.scale, minScale))
      interactedRef.current = true
      commit({ scale, x: sx - wx * scale, y: sy - wy * scale }, true)
    },
    [commit],
  )

  const setAutoFit = useCallback((fit: () => void) => {
    autoFitRef.current = fit
  }, [])

  const resetInteraction = useCallback(() => {
    interactedRef.current = false
  }, [])

  // Non-passive wheel listener: React's onWheel is passive, so preventDefault
  // there is ignored and the page would scroll while the graph zooms.
  useEffect(() => {
    if (!container) return
    const onWheel = (event: WheelEvent) => {
      // Bubbles still zoom the map; only real UI (search, detail card) keeps its own scroll.
      if ((event.target as Element | null)?.closest?.('[data-graph-ui]')) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      markInteraction()
      if (!event.ctrlKey && Math.abs(dx) > Math.abs(dy)) {
        const prev = viewRef.current
        commit({ ...prev, x: prev.x - dx, y: prev.y - dy }, false)
        return
      }
      const point = local(event.clientX, event.clientY)
      const sensitivity = event.ctrlKey ? 0.01 : 0.0015
      zoomAt(point.x, point.y, Math.exp(-dy * sensitivity), false)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [commit, container, local, markInteraction, zoomAt])

  // Refit while the user hasn't touched the view; afterwards keep the same
  // world point centered when the container resizes (including fullscreen).
  useEffect(() => {
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      setWidth(width)
      const previous = lastSize.current
      lastSize.current = { width, height }
      if (!interactedRef.current) {
        autoFitRef.current()
      } else if (previous && (previous.width !== width || previous.height !== height)) {
        const prev = viewRef.current
        commit(
          { ...prev, x: prev.x + (width - previous.width) / 2, y: prev.y + (height - previous.height) / 2 },
          false,
        )
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [commit, container])

  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
    },
    [],
  )

  /** `fromNode`: a touch that began on a bubble still pans, but never counts as a background tap. */
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, fromNode = false) => {
      if (!fromNode && isInteractiveTarget(event.target)) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!fromNode) event.currentTarget.setPointerCapture(event.pointerId)
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.current.size === 1) {
        gesture.current = {
          type: 'pan',
          startX: event.clientX,
          startY: event.clientY,
          origin: viewRef.current,
          moved: false,
          fromNode,
        }
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        gesture.current = {
          type: 'pinch',
          startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startMid: local((a.x + b.x) / 2, (a.y + b.y) / 2),
          origin: viewRef.current,
        }
      }
    },
    [local],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const g = gesture.current
      if (!g) return
      if (g.type === 'pan') {
        const dx = event.clientX - g.startX
        const dy = event.clientY - g.startY
        if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        g.moved = true
        markInteraction()
        commit({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy }, false)
      } else if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()]
        const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2)
        const scale = clampScale((g.origin.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDist)
        const worldX = (g.startMid.x - g.origin.x) / g.origin.scale
        const worldY = (g.startMid.y - g.origin.y) / g.origin.scale
        markInteraction()
        commit({ scale, x: mid.x - worldX * scale, y: mid.y - worldY * scale }, false)
      }
    },
    [commit, local, markInteraction],
  )

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const g = gesture.current
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (pointers.current.size === 0) {
      gesture.current = null
      if (g?.type === 'pan' && !g.moved && !g.fromNode && event.type === 'pointerup') onTapRef.current()
    } else if (pointers.current.size === 1) {
      const [rest] = [...pointers.current.values()]
      gesture.current = { type: 'pan', startX: rest.x, startY: rest.y, origin: viewRef.current, moved: true }
    }
  }, [])

  /** Stop tracking a pointer (e.g. a long-press turned it into a bubble drag). */
  const releasePointer = useCallback((pointerId: number) => {
    if (!pointers.current.delete(pointerId)) return
    if (pointers.current.size === 0) gesture.current = null
  }, [])

  const hasMultiTouch = useCallback(() => pointers.current.size > 1, [])

  return {
    view,
    width,
    releasePointer,
    hasMultiTouch,
    viewRef,
    animated,
    interacting,
    containerRef,
    bindContainer,
    markInteraction,
    fitBounds,
    zoomCenter,
    panBy,
    centerOn,
    setAutoFit,
    resetInteraction,
    isInteracted: () => interactedRef.current,
    size,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
