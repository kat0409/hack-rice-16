import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type EyebrowSize = 'page' | 'card'

// Single source of truth for the small uppercase caption used above page
// titles and inside cards (e.g. "Question", "Narrated recap", "Legend").
// Import this instead of retyping `uppercase tracking-widest2 ...` — two
// different opacities (/50, /70) and two font-weights existed for this same
// role before they were consolidated, purely from copy-paste drift.
const sizeStyles: Record<EyebrowSize, string> = {
  page: 'text-xs', // above a page's <h1>
  card: 'text-[11px]', // inside a card, next to its own title
}

type EyebrowProps = {
  as?: ElementType
  size?: EyebrowSize
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLParagraphElement>, 'className' | 'children'>

export function Eyebrow({ as: Tag = 'p', size = 'page', className, children, ...rest }: EyebrowProps) {
  return (
    <Tag
      className={cn(
        'font-semibold uppercase tracking-widest2 text-ink-soft/60',
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
