import { useSyncExternalStore } from 'react'
import type { StudyStep } from '@/types/study'

type SessionState = {
  courseId: string | null
  sessionId: string | null
  goalText: string
  steps: StudyStep[]
}

let state: SessionState = { courseId: null, sessionId: null, goalText: '', steps: [] }
const listeners = new Set<() => void>()

export function setSession(next: Partial<SessionState>) {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state)
}

export function activeStepOf(steps: StudyStep[]): StudyStep | undefined {
  return steps.find((s) => s.status === 'ACTIVE') ?? steps.find((s) => s.status === 'TODO')
}
