import { useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Maximize2, Minimize2, Minus, Plus, Scan, Search, Undo2, X } from 'lucide-react'
import type { GraphNode, GraphNodeType } from '@/types/graph'
import { NODE_TYPE_STYLE } from '@/lib/graphTheme'
import { cn } from '@/lib/cn'

type GraphToolbarProps = {
  nodes: GraphNode[]
  searchRef: RefObject<HTMLInputElement | null>
  onPick: (node: GraphNode) => void
  typeCounts: [GraphNodeType, number][]
  hiddenTypes: Set<GraphNodeType>
  onToggleType: (type: GraphNodeType) => void
  onShowAll: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  hasMovedNodes: boolean
  onResetLayout: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  // The canvas, not the window, decides layout: it can be narrow on a wide screen.
  compact: boolean
}

const MAX_RESULTS = 8

function matches(node: GraphNode, query: string) {
  return [node.name, ...node.aliases].some((label) => label.toLowerCase().includes(query))
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-dark hover:text-ink"
    >
      {children}
    </button>
  )
}

export function GraphToolbar({
  nodes,
  searchRef,
  onPick,
  typeCounts,
  hiddenTypes,
  onToggleType,
  onShowAll,
  onZoomIn,
  onZoomOut,
  onFit,
  hasMovedNodes,
  onResetLayout,
  fullscreen,
  onToggleFullscreen,
  compact,
}: GraphToolbarProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const results = q
    ? nodes
        .filter((node) => matches(node, q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
        .slice(0, MAX_RESULTS)
    : []

  const pick = (node: GraphNode) => {
    onPick(node)
    setOpen(false)
    setQuery(node.name)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      pick(results[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (query) {
        setQuery('')
        setOpen(false)
      } else {
        event.currentTarget.blur()
      }
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-2">
      <div
        data-graph-ui
        className={cn(
          'pointer-events-auto flex min-w-0 flex-col gap-2',
          compact ? 'order-2 w-full' : 'order-1 max-w-sm flex-1',
        )}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" strokeWidth={1.75} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="Search concepts  ( / )"
            aria-label="Search concepts"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls="graph-search-results"
            className="h-10 w-full rounded-full border-2 border-ink/15 bg-paper pl-9 pr-8 text-sm text-ink shadow-chunky-sm outline-none focus:border-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-paper-dark hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {open && q && (
            <ul
              id="graph-search-results"
              role="listbox"
              className="absolute left-0 top-12 w-full min-w-56 overflow-hidden rounded-xl border-2 border-ink/15 bg-paper py-1 shadow-chunky"
            >
              {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">No matching concepts</li>}
              {results.map((node, i) => {
                const style = NODE_TYPE_STYLE[node.type]
                return (
                  <li key={node.id} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(node)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink',
                        i === active && 'bg-paper-dark',
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: style.color }} />
                      <span className="truncate">{node.name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-ink-soft">{style.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {typeCounts.length > 1 && (
          <div
            className={cn('flex gap-1.5', compact ? '-mx-1 overflow-x-auto px-1 pb-1' : 'flex-wrap')}
            role="group"
            aria-label="Filter by type"
          >
            {typeCounts.map(([type, count]) => {
              const style = NODE_TYPE_STYLE[type]
              const hidden = hiddenTypes.has(type)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onToggleType(type)}
                  aria-pressed={!hidden}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 bg-paper px-2.5 py-1 text-[11px] font-semibold shadow-chunky-sm transition-colors',
                    hidden ? 'border-ink/10 text-ink-soft/60 line-through' : 'border-ink/15 text-ink',
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: hidden ? 'transparent' : style.color, boxShadow: `inset 0 0 0 1.5px ${style.color}` }}
                  />
                  {style.label}
                  <span className="text-ink-soft">{count}</span>
                </button>
              )
            })}
            {hiddenTypes.size > 0 && (
              <button
                type="button"
                onClick={onShowAll}
                className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-accent-dark hover:underline"
              >
                Show all
              </button>
            )}
          </div>
        )}
      </div>

      <div
        data-graph-ui
        className={cn(
          'pointer-events-auto ml-auto flex shrink-0 items-center gap-0.5 rounded-full border-2 border-ink/15 bg-paper p-1 shadow-chunky-sm',
          compact ? 'order-1' : 'order-2',
        )}
      >
        <ControlButton label="Zoom out ( - )" onClick={onZoomOut}>
          <Minus className="h-4 w-4" strokeWidth={1.75} />
        </ControlButton>
        <ControlButton label="Zoom in ( + )" onClick={onZoomIn}>
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </ControlButton>
        <ControlButton label="Fit to screen ( 0 )" onClick={onFit}>
          <Scan className="h-4 w-4" strokeWidth={1.75} />
        </ControlButton>
        {hasMovedNodes && (
          <ControlButton label="Undo moved bubbles" onClick={onResetLayout}>
            <Undo2 className="h-4 w-4" strokeWidth={1.75} />
          </ControlButton>
        )}
        <span className="mx-0.5 h-5 w-px bg-ink/15" aria-hidden="true" />
        <ControlButton label={fullscreen ? 'Exit fullscreen ( Esc )' : 'Fullscreen ( F )'} onClick={onToggleFullscreen}>
          {fullscreen ? <Minimize2 className="h-4 w-4" strokeWidth={1.75} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.75} />}
        </ControlButton>
      </div>
    </div>
  )
}
