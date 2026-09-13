import { Navigate } from 'react-router-dom'
import { DEMO_COURSE_ID } from '@/data/mockCourse'

export function HomePage() {
  return <Navigate to={`/course/${DEMO_COURSE_ID}/path`} replace />
}
