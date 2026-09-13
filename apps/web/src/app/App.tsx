import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useCursorSpotlight } from '@/hooks/useCursorSpotlight'

export function App() {
  const surfaceRef = useCursorSpotlight<HTMLDivElement>()

  return (
    <div ref={surfaceRef} className="paper-surface min-h-screen font-sans text-ink">
      <RouterProvider router={router} />
    </div>
  )
}
