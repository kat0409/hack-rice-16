import type { ReactNode } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { BookOpen, Compass, FileText, Map, Settings as SettingsIcon } from 'lucide-react'
import { DEMO_COURSE_ID, mockCourse } from '@/data/mockCourse'
import { cn } from '@/lib/cn'

const navItems = [
  { label: 'Learning Path', to: (id: string) => `/course/${id}/path`, icon: Compass },
  { label: 'Knowledge Map', to: (id: string) => `/course/${id}/map`, icon: Map },
  { label: 'Sources', to: (id: string) => `/course/${id}/sources`, icon: FileText },
  { label: 'Study Materials', to: (id: string) => `/course/${id}/materials`, icon: BookOpen },
]

const toolItems = ['Flashcards', 'Practice', 'Audio']

export function LeftSidebar() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col justify-between overflow-y-auto border-r border-border/70 bg-paper-dark/30 px-5 py-6 md:flex">
      <div className="flex flex-col gap-8">
        <div className="px-1">
          <span className="font-display text-lg font-semibold tracking-tight text-ink">graphite</span>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Course</SectionLabel>
          <div className="px-1">
            <p className="text-sm font-semibold text-ink">{mockCourse.code}</p>
            <p className="text-xs text-ink-soft">{mockCourse.title}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <SectionLabel>Navigation</SectionLabel>
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to(courseId)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-paper font-medium text-ink shadow-sm'
                    : 'text-ink-soft hover:bg-paper/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isActive ? 'bg-accent' : 'bg-border')}
                    aria-hidden="true"
                  />
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2">
          <SectionLabel>Tools</SectionLabel>
          <div className="flex flex-col gap-1">
            {toolItems.map((tool) => (
              <div
                key={tool}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft/50"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-border" aria-hidden="true" />
                <span>{tool}</span>
                <span className="ml-auto text-[10px] uppercase tracking-widest2 text-ink-soft/40">Soon</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/70 pt-4">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-paper font-medium text-ink' : 'text-ink-soft hover:bg-paper/60 hover:text-ink',
            )
          }
        >
          <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 text-[11px] font-semibold uppercase tracking-widest2 text-ink-soft/70">{children}</p>
  )
}
