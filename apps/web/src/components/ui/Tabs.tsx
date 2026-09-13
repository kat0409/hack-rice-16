import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

export type TabItem = {
  key: string
  label: string
  to: string
  end?: boolean
}

type TabsProps = {
  items: TabItem[]
}

export function Tabs({ items }: TabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-paper/70 p-1">
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-ink text-paper shadow-soft' : 'text-ink-soft hover:text-ink',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  )
}
