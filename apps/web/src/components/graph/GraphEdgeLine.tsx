import { useMemo } from 'react'
import type { GraphEdge } from '@/types/graph'
import type { GraphPoint } from '@/lib/graphLayout'
import { RELATION_STYLE } from '@/lib/graphTheme'
import { handDrawnLinePath } from '@/lib/sketch'

type GraphEdgeLineProps = {
  edge: GraphEdge
  from: GraphPoint
  to: GraphPoint
  fromRadius: number
  toRadius: number
  active: boolean
  dimmed: boolean
}

export function GraphEdgeLine({ edge, from, to, fromRadius, toRadius, active, dimmed }: GraphEdgeLineProps) {
  const style = RELATION_STYLE[edge.relationType]

  const { path, midX, midY, angle } = useMemo(() => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    // Pull endpoints back to the edge of each bubble, not its center.
    const x1 = from.x + ux * (fromRadius + 4)
    const y1 = from.y + uy * (fromRadius + 4)
    const x2 = to.x - ux * (toRadius + (style.arrow ? 12 : 4))
    const y2 = to.y - uy * (toRadius + (style.arrow ? 12 : 4))
    return {
      path: handDrawnLinePath(x1, y1, x2, y2, edge.id),
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  }, [from.x, from.y, to.x, to.y, fromRadius, toRadius, style.arrow, edge.id])

  const markerId = `arrow-${edge.relationType}`

  return (
    <g opacity={dimmed && !active ? 0.16 : active ? 1 : 0.62}>
      <path
        d={path}
        fill="none"
        stroke={style.color}
        strokeWidth={active ? 2.4 : 1.6}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        markerEnd={style.arrow ? `url(#${markerId})` : undefined}
        filter="url(#pencil-wobble)"
      />
      {active && (
        <g transform={`translate(${midX}, ${midY}) rotate(${angle > 90 || angle < -90 ? angle + 180 : angle})`}>
          <rect x={-1} y={-9} width={2} height={18} fill="none" />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={-6}
            className="select-none"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fill: style.color,
              paintOrder: 'stroke',
              stroke: '#F5F1E8',
              strokeWidth: 4,
            }}
          >
            {style.label}
          </text>
        </g>
      )}
    </g>
  )
}
