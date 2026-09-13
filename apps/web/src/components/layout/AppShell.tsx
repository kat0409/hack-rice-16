import type { ReactNode } from 'react'
import { LeftSidebar } from './LeftSidebar'
import { RightStudyRail } from './RightStudyRail'
import { MobileBottomNav } from './MobileBottomNav'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] items-start">
      <LeftSidebar />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-8 md:pb-10 lg:px-10">{children}</main>
      <RightStudyRail />
      <MobileBottomNav />
    </div>
  )
}
