import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { CoursePage } from '@/pages/CoursePage'
import { MapPage } from '@/pages/MapPage'
import { SourcesPage } from '@/pages/SourcesPage'
import { MaterialsPage } from '@/pages/MaterialsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const router = createBrowserRouter([
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '/course/:courseId',
        children: [
          { index: true, element: <Navigate to="path" replace /> },
          { path: 'path', element: <CoursePage /> },
          { path: 'map', element: <MapPage /> },
          { path: 'sources', element: <SourcesPage /> },
          { path: 'materials', element: <MaterialsPage /> },
        ],
      },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])
