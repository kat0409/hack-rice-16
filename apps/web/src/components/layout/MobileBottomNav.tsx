import { NavLink, useParams } from 'react-router-dom'
import { BookOpen, Compass, FileText, Map } from 'lucide-react'
import { DEMO_COURSE_ID } from '@/data/mockCourse'
import { cn } from '@/lib/cn'

const items = [
  { label: 'Path', to: (id: string) => `/course/${id}/path`, icon: Compass },
  { label: 'Map', to: (id: string) => `/course/${id}/map`, icon: Map },
  { label: 'Sources', to: (id: string) => `/course/${id}/sources`, icon: FileText },
  { label: 'Materials', to: (id: string) => `/course/${id}/materials`, icon: BookOpen },
]

export function MobileBottomNav() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t-2 border-ink/10 bg-paper md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.label}
          to={item.to(courseId)}
          className={({ isActive }) =>
            cn(
              'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium',
              isActive ? 'text-accent' : 'text-ink-soft',
            )
          }
        >
          <item.icon className="h-5 w-5" strokeWidth={1.75} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
