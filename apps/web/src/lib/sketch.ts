/**
 * Deterministic "hand-drawn" geometry helpers. Every shape is seeded by a
 * string (usually a node/edge id) so the wobble is stable across re-renders
 * instead of re-randomizing on every paint.
 */

function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/** A wobbly closed blob approximating a circle, smoothed through midpoints. */
export function handDrawnBlobPath(
  cx: number,
  cy: number,
  r: number,
  seed: string,
  points = 10,
  jitter = 0.06,
) {
  const rand = seededRandom(seed)
  const rotation = rand() * Math.PI * 2
  const pts: [number, number][] = []
  for (let i = 0; i < points; i++) {
    const angle = rotation + (i / points) * Math.PI * 2
    const rr = r * (1 + (rand() - 0.5) * jitter * 2)
    pts.push([cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr])
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ]
  const n = pts.length
  const start = mid(pts[n - 1], pts[0])
  let d = `M ${start[0].toFixed(2)} ${start[1].toFixed(2)} `
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const next = pts[(i + 1) % n]
    const m = mid(p, next)
    d += `Q ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${m[0].toFixed(2)} ${m[1].toFixed(2)} `
  }
  return d + 'Z'
}

/** A gently wobbling line between two points — never perfectly straight. */
export function handDrawnLinePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: string,
  segments = 7,
  jitter = 5,
) {
  const rand = seededRandom(seed)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  let d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} `
  for (let i = 1; i < segments; i++) {
    const t = i / segments
    const bx = x1 + dx * t
    const by = y1 + dy * t
    const envelope = Math.sin(t * Math.PI)
    const offset = (rand() - 0.5) * 2 * jitter * envelope
    d += `L ${(bx + nx * offset).toFixed(2)} ${(by + ny * offset).toFixed(2)} `
  }
  return d + `L ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export { seededRandom }
