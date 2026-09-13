import type { GraphEdge, GraphNode } from '@/types/graph'
import { RELATION_STYLE } from '@/lib/graphTheme'
import { seededRandom } from '@/lib/sketch'

export type GraphPoint = {
  id: string
  x: number
  y: number
  tier: number
}

export type GraphLayout = {
  points: Map<string, GraphPoint>
  width: number
  height: number
}

const TIER_GAP = 210
const ROW_GAP = 150
const MARGIN_X = 110
const MARGIN_Y = 90
const SUBCOLUMN_GAP = 190
const MIN_ROWS = 4
const TARGET_ASPECT = 1.6

/**
 * Lays out nodes left-to-right by dependency depth: hierarchy edges
 * (requires / part-of / derived-from / applied-in / example-of) push their
 * source at least one tier after their target, computed via relaxation
 * (cheap and sufficient for the small DAGs a single course produces).
 */
export function computeGraphLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphLayout {
  const tiers = new Map(nodes.map((node) => [node.id, 0]))
  const hierarchyEdges = edges.filter((edge) => RELATION_STYLE[edge.relationType].hierarchical)

  for (let i = 0; i < nodes.length; i++) {
    let changed = false
    for (const edge of hierarchyEdges) {
      if (!tiers.has(edge.source) || !tiers.has(edge.target)) continue
      const candidate = (tiers.get(edge.target) ?? 0) + 1
      if (candidate > (tiers.get(edge.source) ?? 0)) {
        tiers.set(edge.source, candidate)
        changed = true
      }
    }
    if (!changed) break
  }

  const byTier = new Map<number, GraphNode[]>()
  for (const node of nodes) {
    const tier = tiers.get(node.id) ?? 0
    const bucket = byTier.get(tier)
    if (bucket) bucket.push(node)
    else byTier.set(tier, [node])
  }

  // A tier with many unconnected concepts would otherwise stack into one very
  // tall column that no zoom level can show legibly. Cap rows per column so the
  // whole map lands near a landscape aspect ratio, wrapping a tall tier into
  // side-by-side sub-columns. Tiers still read left to right.
  const maxRows = Math.max(MIN_ROWS, Math.ceil(Math.sqrt(nodes.length / TARGET_ASPECT)))
  const tierOrder = Array.from(byTier.keys()).sort((a, b) => a - b)
  const tierColumns = new Map(tierOrder.map((tier) => [tier, Math.ceil(byTier.get(tier)!.length / maxRows)]))
  const rows = Math.min(maxRows, Math.max(...Array.from(byTier.values(), (bucket) => bucket.length)))
  const height = MARGIN_Y * 2 + (rows - 1) * ROW_GAP

  const points = new Map<string, GraphPoint>()
  let columnX = MARGIN_X
  for (const tier of tierOrder) {
    const bucket = byTier.get(tier)!
    const columns = tierColumns.get(tier)!
    for (let column = 0; column < columns; column++) {
      const slice = bucket.slice(column * maxRows, (column + 1) * maxRows)
      const offsetY = (height - (slice.length - 1) * ROW_GAP) / 2
      slice.forEach((node, index) => {
        const rand = seededRandom(node.id)
        const jitterX = (rand() - 0.5) * 26
        const jitterY = (rand() - 0.5) * 22
        points.set(node.id, {
          id: node.id,
          tier,
          x: columnX + column * SUBCOLUMN_GAP + jitterX,
          y: offsetY + index * ROW_GAP + jitterY,
        })
      })
    }
    columnX += (columns - 1) * SUBCOLUMN_GAP + TIER_GAP
  }
  const width = columnX - TIER_GAP + MARGIN_X

  return { points, width, height }
}
