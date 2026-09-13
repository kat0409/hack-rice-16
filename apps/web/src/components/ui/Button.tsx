import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-paper hover:bg-accent-dark shadow-node',
  secondary: 'bg-paper border border-border text-ink hover:border-ink-soft',
  ghost: 'text-ink-soft hover:text-ink hover:bg-paper-dark/60',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-full',
  md: 'h-11 px-5 text-sm rounded-full',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  )
})
