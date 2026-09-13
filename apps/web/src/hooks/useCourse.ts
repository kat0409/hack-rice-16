import { useEffect, useState } from 'react'
import { api, type CourseDto } from '@/lib/api'

export function useCourse(courseId: string | undefined) {
  const [course, setCourse] = useState<CourseDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    api
      .getCourse(courseId)
      .then((c) => {
        if (!cancelled) setCourse(c)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  return { course, error }
}
