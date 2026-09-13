import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type HeadingSize = 'page' | 'section' | 'concept'

// Single source of truth for every heading's font — always the display
// (pencil/notebook) typeface. Every page title, card title, and "concept
// name" header in the app should go through this component instead of
// hand-typing `font-display text-... font-...` — that drift is exactly what
// let one page's title end up on a different font/size than every other
// page's, and "Process States" render at two different sizes in two places
// visible on screen at once.
// Press Start 2P (font-retro) glyphs are much wider per character than the
// old handwriting font, so sizes are scaled down to avoid overflow.
const sizeStyles: Record<HeadingSize, string> = {
  page: 'text-base font-bold leading-relaxed sm:text-lg', // page-level <h1> titles
  section: 'text-sm font-bold leading-relaxed', // card/section titles within a page
  concept: 'text-xs font-bold leading-relaxed', // a single concept/entity name (route step, study rail, graph node)
}

type HeadingProps = {
  as?: ElementType
  size?: HeadingSize
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLHeadingElement>, 'className' | 'children'>

export function Heading({ as: Tag = 'h2', size = 'section', className, children, ...rest }: HeadingProps) {
  return (
    <Tag className={cn('font-retro text-ink', sizeStyles[size], className)} {...rest}>
      {children}
    </Tag>
  )
}
