export type RoutePoint = {
  id: string
  x: number
  y: number
}

/** Small deterministic PRNG so the "organic" route layout is stable across reloads. */
function mulberry32(seed: number) {
  let state = seed
  return function random() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const MIN_GAP = 150
const MAX_GAP = 210
const CENTER_X = 0.5
const MIN_AMPLITUDE = 0.24
const MAX_AMPLITUDE = 0.34
const MIN_X = 0.12
const MAX_X = 0.88

type ComputeRouteLayoutOptions = {
  seed?: number
  /**
   * Extra vertical gap to insert after the node at each index — used to make
   * room for a taller rendered node (e.g. the expanded current-step card)
   * without it visually colliding with the next node down.
   */
  extraGapAfter?: number[]
  /**
   * Indices to place dead-center (x = 0.5) instead of on the alternating
   * left/right weave — used for nodes that render much wider than a normal
   * node (e.g. the expanded current-step card) so their content can never
   * clip the sidebars/viewport regardless of screen width, while keeping the
   * SVG path perfectly in sync (both derive from the same point).
   */
  centerIndices?: number[]
}

/**
 * Lays out route nodes with normalized x (0-1, clamped so labels never reach
 * the sidebars) and cumulative pixel y. Nodes alternate left/right with
 * randomized gap and amplitude so the route reads as organic rather than a
 * perfectly symmetric zigzag.
 */
export function computeRouteLayout(ids: string[], options: ComputeRouteLayoutOptions = {}): RoutePoint[] {
  const { seed = 7, extraGapAfter = [], centerIndices = [] } = options
  const random = mulberry32(seed)
  const points: RoutePoint[] = []
  let y = 0
  let direction: 1 | -1 = random() > 0.5 ? 1 : -1

  ids.forEach((id, index) => {
    if (index > 0) {
      const gap = MIN_GAP + random() * (MAX_GAP - MIN_GAP) + (extraGapAfter[index - 1] ?? 0)
      y += gap
    }

    let x = CENTER_X
    if (centerIndices.includes(index)) {
      // Consume the same amount of randomness as a normal node so later
      // nodes in the sequence are unaffected by centering this one.
      random()
      random()
    } else {
      const amplitude = MIN_AMPLITUDE + random() * (MAX_AMPLITUDE - MIN_AMPLITUDE)
      const jitter = (random() - 0.5) * 0.06
      x = clamp(CENTER_X + direction * amplitude + jitter, MIN_X, MAX_X)
    }

    points.push({ id, x, y })
    direction = direction === 1 ? -1 : 1
  })

  return points
}

/**
 * Builds a smooth SVG path through the points using cubic Beziers with
 * vertically-offset control points — this is what makes the route feel like
 * a winding road rather than a hard-angled zigzag.
 */
export function buildRoutePath(points: RoutePoint[], viewBoxWidth: number): string {
  if (points.length === 0) return ''
  const scaled = points.map((point) => ({ x: point.x * viewBoxWidth, y: point.y }))
  let d = `M ${scaled[0].x} ${scaled[0].y}`

  for (let i = 1; i < scaled.length; i++) {
    const prev = scaled[i - 1]
    const curr = scaled[i]
    const midY = (prev.y + curr.y) / 2
    d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`
  }

  return d
}

export function totalRouteHeight(points: RoutePoint[], bottomPadding = 120): number {
  if (points.length === 0) return 0
  return points[points.length - 1].y + bottomPadding
}
