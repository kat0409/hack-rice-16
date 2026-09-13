import { useEffect, useRef, useState } from 'react'

/**
 * Tracks whether an element is currently intersecting the viewport, via
 * IntersectionObserver — reactive to scroll and resize with no manual scroll
 * math, and flips back to false the moment the element scrolls back out.
 */
export function useIsInView<T extends HTMLElement>(rootMargin = '0px') {
  const ref = useRef<T | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), {
      rootMargin,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return [ref, isInView] as const
}
