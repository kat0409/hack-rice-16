import { useMemo } from 'react'
import type { GraphNode } from '@/types/graph'
import { NODE_TYPE_STYLE } from '@/lib/graphTheme'
import { handDrawnBlobPath } from '@/lib/sketch'
import { cn } from '@/lib/cn'

type GraphNodeBubbleProps = {
  node: GraphNode
  size: number
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}

export function GraphNodeBubble({ node, size, selected, dimmed, onSelect }: GraphNodeBubbleProps) {
  const style = NODE_TYPE_STYLE[node.type]
  const isTentative = node.confidence < 0.7

  const outerBlob = useMemo(() => handDrawnBlobPath(50, 50, 42, `${node.id}-a`, 10, 0.06), [node.id])
  const innerBlob = useMemo(() => handDrawnBlobPath(50, 50, 38, `${node.id}-b`, 12, 0.08), [node.id])

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-opacity duration-200',
        dimmed && !selected && 'opacity-35',
      )}
      style={{ width: size + 90 }}
      aria-pressed={selected}
    >
      <span
        className="relative block shrink-0 transition-transform duration-200 group-hover:scale-[1.06]"
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
            filter="url(#pencil-wobble)"
          />
          <path
            d={innerBlob}
            fill="none"
            stroke={style.color}
            strokeWidth={1.1}
            opacity={0.5}
            filter="url(#pencil-wobble)"
          />
        </svg>
        <span className="relative flex h-full w-full items-center justify-center">
          <style.Icon
            className="h-[34%] w-[34%]"
            style={{ color: style.color }}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
      </span>
      <span
        className={cn(
          'mt-1.5 max-w-[130px] text-balance text-center font-display text-[12px] font-semibold leading-tight text-ink',
          selected && 'text-ink',
        )}
      >
        {node.name}
      </span>
    </button>
  )
}
