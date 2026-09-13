import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { api, type CourseDto } from '@/lib/api'

export function HomePage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseDto[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api
      .listCourses()
      .then((r) => setCourses(r.items))
      .catch((err: Error) => setError(err.message))
  }, [])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const course = await api.createCourse(trimmed)
      navigate(`/course/${course.id}/sources`)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>graphite</Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          What are you studying?
        </Heading>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          A subject is anything with notes: a course, a certification, an exam. Drop your files in and graphite
          maps the concepts, then routes you through them in the time you have.
        </p>
      </header>

      <form
        onSubmit={create}
        className="flex flex-col gap-3 rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1.5">
          <Eyebrow size="card">New subject</Eyebrow>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. CS 4348 Operating Systems, AWS Solutions Architect, MCAT Biology"
            className="h-11 rounded-xl border-2 border-ink/15 bg-paper-dark px-4 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <Button type="submit" disabled={creating || !name.trim()}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create
        </Button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="flex flex-col gap-3">
        <Eyebrow>Your subjects</Eyebrow>
        {courses === null && <p className="text-sm text-ink-soft">Loading…</p>}
        {courses?.length === 0 && (
          <p className="text-sm text-ink-soft">No subjects yet — create one above to get started.</p>
        )}
        <ul className="flex flex-col gap-3">
          {courses?.map((course) => (
            <li key={course.id}>
              <Link
                to={`/course/${course.id}/path`}
                className="flex items-center justify-between gap-4 rounded-xl border-2 border-ink/10 bg-paper px-4 py-3 shadow-chunky-sm transition-colors hover:border-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{course.name}</p>
                  {course.description && (
                    <p className="truncate text-xs text-ink-soft">{course.description}</p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
