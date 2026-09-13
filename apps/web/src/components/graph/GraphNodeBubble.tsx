import { memo, useMemo } from 'react'
import type { GraphNode } from '@/types/graph'
import { NODE_TYPE_STYLE } from '@/lib/graphTheme'
import { handDrawnBlobPath } from '@/lib/sketch'
import { cn } from '@/lib/cn'

type GraphNodeBubbleProps = {
  node: GraphNode
  size: number
  selected: boolean
  dimmed: boolean
  showLabel: boolean
  lowDetail: boolean
  onSelect: (id: string) => void
}

export const GraphNodeBubble = memo(function GraphNodeBubble({
  node,
  size,
  selected,
  dimmed,
  showLabel,
  lowDetail,
  onSelect,
}: GraphNodeBubbleProps) {
  const style = NODE_TYPE_STYLE[node.type]
  const isTentative = node.confidence < 0.7
  const wobble = lowDetail ? undefined : 'url(#pencil-wobble)'

  const outerBlob = useMemo(() => handDrawnBlobPath(50, 50, 42, `${node.id}-a`, 10, 0.06), [node.id])
  const innerBlob = useMemo(() => handDrawnBlobPath(50, 50, 38, `${node.id}-b`, 12, 0.08), [node.id])

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={cn(
        'group absolute left-0 flex -translate-x-1/2 cursor-pointer flex-col items-center outline-none transition-opacity duration-200',
        dimmed && !selected && 'opacity-35',
      )}
      // Anchor the bubble's center (not bubble + label) on the layout point, so
      // edges, which aim at the point, meet the visible bubble.
      style={{ width: size + 90, top: -size / 2 }}
      aria-pressed={selected}
      aria-label={`${node.name}, ${style.label}`}
    >
      <span
        className="relative block shrink-0 rounded-full transition-transform duration-200 group-hover:scale-[1.06] group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2"
        style={{ width: size, height: size }}
      >
        {selected && (
          <span
            className="absolute inset-[-10px] rounded-full"
            style={{
              background: `radial-gradient(circle, ${style.color}33, transparent 70%)`,
            }}
            aria-hidden="true"
          />
        )}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
          <path
            d={outerBlob}
            fill={style.soft}
            stroke={style.color}
            strokeWidth={selected ? 3.2 : 2.2}
            strokeDasharray={isTentative ? '4 3' : undefined}
            filter={wobble}
          />
          <path d={innerBlob} fill="none" stroke={style.color} strokeWidth={1.1} opacity={0.5} filter={wobble} />
        </svg>
        <span className="relative flex h-full w-full items-center justify-center">
          <style.Icon className="h-[34%] w-[34%]" style={{ color: style.color }} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </span>
      <span
        className={cn(
          'mt-1.5 max-w-[130px] text-balance text-center font-display text-[12px] font-semibold leading-tight text-ink transition-opacity duration-150',
          !showLabel && 'opacity-0',
        )}
      >
        {node.name}
      </span>
    </button>
  )
})
