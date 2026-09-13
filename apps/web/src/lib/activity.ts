import { BookOpen, CircleCheck, PenLine, RotateCcw, type LucideIcon } from 'lucide-react'
import type { ActivityType } from '@/types/study'

export function activityLabel(type: ActivityType): string {
  switch (type) {
    case 'LEARN':
      return 'Learn'
    case 'REVIEW':
      return 'Review'
    case 'PRACTICE':
      return 'Practice'
    case 'CHECK':
      return 'Check'
  }
}

export const activityIcon: Record<ActivityType, LucideIcon> = {
  LEARN: BookOpen,
  REVIEW: RotateCcw,
  PRACTICE: PenLine,
  CHECK: CircleCheck,
}
