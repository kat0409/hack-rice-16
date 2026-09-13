import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useCursorSpotlight } from '@/hooks/useCursorSpotlight'

export function App() {
  const spotlightRef = useCursorSpotlight<HTMLDivElement>()

  return (
    <div className="paper-surface min-h-screen font-sans text-ink">
      <div className="paper-dots" aria-hidden="true" />
      <div ref={spotlightRef} className="paper-spotlight" data-active="false" aria-hidden="true" />
      <div className="paper-grain" aria-hidden="true" />
      <RouterProvider router={router} />
    </div>
  )
}
