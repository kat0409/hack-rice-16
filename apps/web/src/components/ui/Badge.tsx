import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'neutral' | 'accent' | 'outline'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: 'bg-paper-dark text-ink-soft',
  accent: 'bg-accent-soft text-accent-dark',
  outline: 'border-2 border-ink/15 text-ink-soft',
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest2',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  )
}
