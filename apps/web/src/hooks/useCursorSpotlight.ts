import { useEffect, useRef } from 'react'

const FADE_MS = 400
const IDLE_MS = 2200
// Matches the two non-transparent color stops of the spotlight gradient in
// paper-texture.css at full intensity.
const PEAK_ALPHA_1 = 0.32
const PEAK_ALPHA_2 = 0.12

/**
 * Tracks pointer position and writes it to CSS custom properties on the
 * returned element (`.paper-surface`), powering the accent glow that's baked
 * into its background in `paper-texture.css`. Fades in/out by animating the
 * gradient's own alpha custom properties via requestAnimationFrame — not a
 * CSS opacity transition on a separate layered element — because a separate
 * `position: fixed` element for this was found to bleed through opaque cards
 * (see paper-texture.css's comment on `.paper-surface`). Fades out after the
 * pointer has been idle for a bit, or leaves the window, so it reads as a
 * live touch rather than a static decoration glued to wherever the mouse
 * last was.
 */
export function useCursorSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let moveFrame = 0
    let fadeFrame = 0
    let hideTimeout = 0
    let intensity = 0

    const applyIntensity = (value: number) => {
      element.style.setProperty('--spotlight-alpha-1', String(PEAK_ALPHA_1 * value))
      element.style.setProperty('--spotlight-alpha-2', String(PEAK_ALPHA_2 * value))
    }

    const animateTo = (to: number) => {
      cancelAnimationFrame(fadeFrame)
      const from = intensity
      if (from === to) return
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / FADE_MS)
        intensity = from + (to - from) * t
        applyIntensity(intensity)
        if (t < 1) fadeFrame = requestAnimationFrame(step)
      }
      fadeFrame = requestAnimationFrame(step)
    }

    const handlePointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(moveFrame)
      moveFrame = requestAnimationFrame(() => {
        element.style.setProperty('--spotlight-x', `${event.clientX}px`)
        element.style.setProperty('--spotlight-y', `${event.clientY}px`)
      })

      animateTo(1)

      window.clearTimeout(hideTimeout)
      hideTimeout = window.setTimeout(() => animateTo(0), IDLE_MS)
    }

    const handlePointerLeave = () => animateTo(0)

    window.addEventListener('pointermove', handlePointerMove)
    document.documentElement.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
      cancelAnimationFrame(moveFrame)
      cancelAnimationFrame(fadeFrame)
      window.clearTimeout(hideTimeout)
    }
  }, [])

  return ref
}
