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

  const tierCount = Math.max(...byTier.keys()) + 1
  const maxRows = Math.max(...Array.from(byTier.values(), (bucket) => bucket.length))
  const height = MARGIN_Y * 2 + (maxRows - 1) * ROW_GAP
  const width = MARGIN_X * 2 + (tierCount - 1) * TIER_GAP

  const points = new Map<string, GraphPoint>()
  for (const [tier, bucket] of byTier) {
    const tierHeight = (bucket.length - 1) * ROW_GAP
    const offsetY = (height - tierHeight) / 2
    bucket.forEach((node, index) => {
      const rand = seededRandom(node.id)
      const jitterX = (rand() - 0.5) * 26
      const jitterY = (rand() - 0.5) * 22
      points.set(node.id, {
        id: node.id,
        tier,
        x: MARGIN_X + tier * TIER_GAP + jitterX,
        y: offsetY + index * ROW_GAP + jitterY,
      })
    })
  }

  return { points, width, height }
}
