import { RouterProvider } from 'react-router-dom'
import { router } from './router'

export function App() {
  return (
    <div className="paper-surface min-h-screen font-sans text-ink">
      <div className="paper-grain" aria-hidden="true" />
      <RouterProvider router={router} />
    </div>
  )
}
