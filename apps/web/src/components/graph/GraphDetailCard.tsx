import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { GraphEdge, GraphNode } from '@/types/graph'
import { NODE_TYPE_STYLE, RELATION_STYLE } from '@/lib/graphTheme'
import { cn } from '@/lib/cn'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'

type ConnectedEdge = {
  edge: GraphEdge
  other: GraphNode
  direction: 'outgoing' | 'incoming'
}

type GraphDetailCardProps = {
  node: GraphNode
  connected: ConnectedEdge[]
  onClose: () => void
  onSelectNode: (id: string) => void
}

function MeterBar({ value, color }: { value: number; color: string }) {
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.round(value * 100)}%`, background: color }}
      />
    </span>
  )
}

export function GraphDetailCard({ node, connected, onClose, onSelectNode }: GraphDetailCardProps) {
  const style = NODE_TYPE_STYLE[node.type]
  const [expandedEdgeId, setExpandedEdgeId] = useState<string | null>(null)

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20 max-h-[70%] w-[280px] -rotate-1 overflow-y-auto rounded-sm border-2 border-ink/15 bg-[#FCF9F0] p-4 shadow-chunky sm:w-[320px]">
      <span
        className="absolute -top-2.5 left-1/2 h-5 w-9 -translate-x-1/2 rotate-2 rounded-[2px] bg-[#E8DFB8]/80 shadow-sm"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 text-ink-soft/50 hover:text-ink-soft"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: style.soft }}
        >
          <style.Icon className="h-3.5 w-3.5" style={{ color: style.color }} strokeWidth={1.75} />
        </span>
        <Eyebrow as="span" size="card" style={{ color: style.color }}>
          {style.label}
        </Eyebrow>
      </div>

      <Heading as="h3" size="concept" className="mt-2 leading-snug">
        {node.name}
      </Heading>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{node.description}</p>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <Eyebrow size="card">Importance</Eyebrow>
          <div className="mt-1"><MeterBar value={node.importance} color={style.color} /></div>
        </div>
        <div>
          <Eyebrow size="card">Confidence</Eyebrow>
          <div className="mt-1"><MeterBar value={node.confidence} color="#4056A1" /></div>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] text-ink-soft/70">
        {node.sourceCount} source{node.sourceCount === 1 ? '' : 's'} cited
      </p>

      {connected.length > 0 && (
        <div className="mt-3 border-t border-dashed border-ink/15 pt-2.5">
          <Eyebrow size="card">Connections</Eyebrow>
          <ul className="mt-1.5 flex flex-col gap-1">
            {connected.map(({ edge, other, direction }) => {
              const relation = RELATION_STYLE[edge.relationType]
              const expanded = expandedEdgeId === edge.id
              const evidence = edge.evidence[0]
              return (
                <li key={edge.id} className="rounded px-1 py-0.5 hover:bg-ink/5">
                  <div className="flex items-baseline gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setExpandedEdgeId(expanded ? null : edge.id)}
                      className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
                      aria-expanded={expanded}
                    >
                      <span className="shrink-0 text-[10px] italic" style={{ color: relation.color }}>
                        {direction === 'outgoing' ? relation.label : `← ${relation.label}`}
                      </span>
                      <span className="truncate font-medium text-ink-soft">{other.name}</span>
                      <ChevronDown
                        className={cn('ml-auto h-3 w-3 shrink-0 text-ink-soft/50 transition-transform', expanded && 'rotate-180')}
                      />
                    </button>
                  </div>
                  {expanded && (
                    <div className="mb-1 mt-1.5 flex flex-col gap-1.5 border-l-2 border-ink/10 pl-2">
                      <div className="flex items-center gap-2">
                        <Eyebrow size="card">Confidence</Eyebrow>
                        <div className="flex-1"><MeterBar value={edge.confidence} color={relation.color} /></div>
                        {edge.confidence < 0.5 && (
                          <span className="text-[10px] uppercase tracking-widest2 text-ink-soft/60">review</span>
                        )}
                      </div>
                      {edge.rationale && <p className="text-[11px] leading-relaxed text-ink-soft">{edge.rationale}</p>}
                      {evidence ? (
                        <p className="font-serif text-[11px] italic leading-relaxed text-ink-soft">
                          &ldquo;{evidence.excerpt}&rdquo;
                          <span className="mt-0.5 block not-italic text-ink-soft/60">— {evidence.label}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-ink-soft/60">No source excerpt recorded.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectNode(other.id)}
                        className="self-start text-[11px] font-semibold text-accent hover:underline"
                      >
                        Go to {other.name}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
