import { NavLink, useParams } from 'react-router-dom'
import { BookOpen, Compass, FileText, Layers, Map, Mic, Settings as SettingsIcon, Target } from 'lucide-react'
import { DEMO_COURSE_ID, mockCourse } from '@/data/mockCourse'
import { cn } from '@/lib/cn'
import { Eyebrow } from '@/components/ui/Eyebrow'

const navItems = [
  { label: 'Learning Path', to: (id: string) => `/course/${id}/path`, icon: Compass },
  { label: 'Knowledge Map', to: (id: string) => `/course/${id}/map`, icon: Map },
  { label: 'Sources', to: (id: string) => `/course/${id}/sources`, icon: FileText },
  { label: 'Study Materials', to: (id: string) => `/course/${id}/materials`, icon: BookOpen },
]

const toolItems = [
  { label: 'Flashcards', to: (id: string) => `/course/${id}/flashcards`, icon: Layers },
  { label: 'Practice', to: (id: string) => `/course/${id}/practice`, icon: Target },
  { label: 'Audio', to: (id: string) => `/course/${id}/audio`, icon: Mic },
]

export function LeftSidebar() {
  const { courseId = DEMO_COURSE_ID } = useParams()

  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col justify-between overflow-y-auto border-r-2 border-ink/10 bg-paper px-5 py-6 md:flex">
      <div className="flex flex-col gap-8">
        <div className="px-1">
          <span className="inline-block -rotate-2 font-retro text-sm leading-relaxed text-ink">graphite</span>
        </div>

        <div className="flex flex-col gap-2">
          <Eyebrow size="card">Course</Eyebrow>
          <div className="px-1">
            <p className="text-sm font-semibold text-ink">{mockCourse.code}</p>
            <p className="text-xs text-ink-soft">{mockCourse.title}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <Eyebrow size="card">Navigation</Eyebrow>
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to(courseId)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'border-ink/10 bg-paper-dark font-semibold text-ink shadow-chunky-sm'
                    : 'border-transparent text-ink-soft hover:border-ink/10 hover:bg-paper-dark/60 hover:text-ink',
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
          <Eyebrow size="card">Tools</Eyebrow>
          <div className="flex flex-col gap-1">
            {toolItems.map((tool) => (
              <NavLink
                key={tool.label}
                to={tool.to(courseId)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'border-ink/10 bg-paper-dark font-semibold text-ink shadow-chunky-sm'
                      : 'border-transparent text-ink-soft hover:border-ink/10 hover:bg-paper-dark/60 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isActive ? 'bg-accent' : 'bg-border')}
                      aria-hidden="true"
                    />
                    <tool.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span>{tool.label}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-widest2 text-ink-soft/40">Preview</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t-2 border-ink/10 pt-4">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-sm transition-colors',
              isActive
                ? 'border-ink/10 bg-paper-dark font-semibold text-ink shadow-chunky-sm'
                : 'border-transparent text-ink-soft hover:border-ink/10 hover:bg-paper-dark/60 hover:text-ink',
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
