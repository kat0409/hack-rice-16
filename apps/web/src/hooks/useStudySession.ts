import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { mapSession } from '@/lib/mappers'
import { setSession, useSession } from '@/lib/sessionStore'

/** Loads the newest study session for a subject into the shared store. */
export function useStudySession(courseId: string | undefined) {
  const session = useSession()
  const [loading, setLoading] = useState(session.courseId !== courseId)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!courseId) return
    const { items } = await api.listStudySessions(courseId)
    if (items.length === 0) {
      setSession({ courseId, sessionId: null, goalText: '', steps: [] })
      return
    }
    const dto = await api.getStudySession(items[0].id)
    setSession({ courseId, sessionId: dto.id, goalText: dto.goal_text, steps: mapSession(dto) })
  }, [courseId])

  useEffect(() => {
    if (!courseId || session.courseId === courseId) return
    setLoading(true)
    refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [courseId, refresh, session.courseId])

  return { session, loading, error, refresh }
}
