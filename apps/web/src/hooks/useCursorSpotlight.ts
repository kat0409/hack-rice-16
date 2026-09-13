import { useEffect, useRef } from 'react'

/**
 * Tracks pointer position and writes it to CSS custom properties on the
 * returned element, powering the accent glow in `paper-texture.css` that
 * follows the cursor. Fades out after the pointer has been idle for a bit,
 * or leaves the window, so it reads as a live touch rather than a static
 * decoration glued to wherever the mouse last was.
 */
export function useCursorSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let hideTimeout = 0

    const handlePointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        element.style.setProperty('--spotlight-x', `${event.clientX}px`)
        element.style.setProperty('--spotlight-y', `${event.clientY}px`)
        element.dataset.active = 'true'
      })

      window.clearTimeout(hideTimeout)
      hideTimeout = window.setTimeout(() => {
        element.dataset.active = 'false'
      }, 2200)
    }

    const handlePointerLeave = () => {
      element.dataset.active = 'false'
    }

    window.addEventListener('pointermove', handlePointerMove)
    document.documentElement.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
      cancelAnimationFrame(frame)
      window.clearTimeout(hideTimeout)
    }
  }, [])

  return ref
}
