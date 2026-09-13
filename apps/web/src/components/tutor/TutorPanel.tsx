import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Map as MapIcon, Mic, Pencil, RotateCw, Send, Square, Trash2, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { api, type ApiError, type EvidenceDto } from '@/lib/api'
import { cn } from '@/lib/cn'

type Phase = 'idle' | 'transcribing' | 'thinking' | 'speaking'

type UserTurn = { id: string; role: 'user'; text: string }
type TutorTurn = {
  id: string
  role: 'tutor'
  text: string
  citations: EvidenceDto[]
  concepts: { id: string; name: string }[]
  audioUrl: string | null
  audioError: string | null
}
type Turn = UserTurn | TutorTurn

const HOLD_MS = 300
const HISTORY_TURNS = 12
const MAX_SAVED_TURNS = 100

// Demo-grade persistence: the conversation lives in this browser, one per subject.
// Answer audio is cached server-side by content hash, so saved Replay links keep working.
const storageKey = (courseId: string) => `graphite:tutor:${courseId}`

function loadTurns(courseId: string): Turn[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(courseId)) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const newId = () => crypto.randomUUID()

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  transcribing: 'Transcribing…',
  thinking: 'Thinking through your notes…',
  speaking: 'Speaking…',
}

export function TutorPanel({ courseId }: { courseId: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(courseId))
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [openCitation, setOpenCitation] = useState<string | null>(null)

  const turnsRef = useRef<Turn[]>(turns)
  useEffect(() => {
    turnsRef.current = turns
    try {
      localStorage.setItem(storageKey(courseId), JSON.stringify(turns.slice(-MAX_SAVED_TURNS)))
    } catch {
      // Storage full or blocked: the chat still works for this session.
    }
  }, [turns, courseId])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const pressStartedAt = useRef(0)
  const [tapToggled, setTapToggled] = useState(false)

  const play = useCallback((turn: TutorTurn) => {
    const el = audioRef.current
    if (!el || !turn.audioUrl) return
    el.src = turn.audioUrl
    setPlayingId(turn.id)
    setPhase('speaking')
    el.play().catch(() => {
      setPlayingId(null)
      setPhase('idle')
    })
  }, [])

  const stopAudio = useCallback(() => {
    const el = audioRef.current
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    setPlayingId(null)
    setPhase('idle')
  }, [])

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim()
      if (!text) return
      setError(null)
      setDraft('')
      const history = turnsRef.current.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, text: t.text }))
      setTurns((prev) => [...prev, { id: newId(), role: 'user', text }])
      setPhase('thinking')
      try {
        const result = await api.tutorTurn(courseId, text, history)
        const turn: TutorTurn = {
          id: newId(),
          role: 'tutor',
          text: result.answer_text,
          citations: result.citations,
          concepts: result.concepts,
          audioUrl: result.audio_id ? api.tutorAudioUrl(result.audio_id) : null,
          audioError: result.audio_error,
        }
        setTurns((prev) => [...prev, turn])
        if (turn.audioUrl) {
          play(turn)
        } else {
          setPhase('idle')
        }
      } catch (err) {
        const apiErr = err as ApiError
        setError(
          apiErr.code === 'MODEL_UNAVAILABLE'
            ? 'The tutor model is unavailable right now. Try again in a moment.'
            : apiErr.message,
        )
        setPhase('idle')
      }
    },
    [courseId, play],
  )

  const onTake = useCallback(
    async (audio: Blob, filename: string) => {
      setError(null)
      setPhase('transcribing')
      try {
        const { text } = await api.transcribeAudio(courseId, audio, filename)
        const heard = text.trim()
        if (!heard) {
          setError("Didn't catch that. Try again a little closer to the mic.")
          setPhase('idle')
          return
        }
        setDraft(heard)
        setPhase('idle')
        requestAnimationFrame(() => inputRef.current?.focus())
      } catch (err) {
        const apiErr = err as ApiError
        setError(
          apiErr.code === 'TRANSCRIPTION_UNAVAILABLE'
            ? 'Voice input is unavailable right now. You can still type your question.'
            : apiErr.message,
        )
        setPhase('idle')
      }
    },
    [courseId],
  )

  const recorder = useVoiceRecorder({ onTake })

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [turns.length, phase])

  const clearChat = () => {
    stopAudio()
    setTurns([])
    setDraft('')
    setError(null)
  }

  const busy = phase === 'transcribing' || phase === 'thinking'
  const recording = recorder.status === 'recording'

  const onMicDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (busy) return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (recording) {
      setTapToggled(false)
      recorder.stopTake()
      return
    }
    if (phase === 'speaking') stopAudio()
    pressStartedAt.current = performance.now()
    setTapToggled(false)
    void recorder.startTake()
  }

  const onMicUp = () => {
    if (performance.now() - pressStartedAt.current >= HOLD_MS) {
      recorder.stopTake()
    } else {
      setTapToggled(true)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!busy) void ask(draft)
  }

  const micBlocked = recorder.status === 'unsupported' || recorder.status === 'denied' || recorder.status === 'error'
  const status =
    PHASE_LABEL[phase] ||
    (recording ? (tapToggled ? 'Recording — tap again to finish' : 'Recording — release to finish') : '')

  return (
    <section className="rounded-2xl border-2 border-ink/10 bg-paper p-6 shadow-chunky">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow size="card">Talk to your notes</Eyebrow>
          <Heading as="h2" size="section" className="mt-1">
            Voice tutor
          </Heading>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Ask out loud and get a spoken answer drawn only from this subject&apos;s notes, with the sources it used.
          </p>
        </div>
        {turns.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={clearChat} disabled={phase === 'thinking' || phase === 'transcribing'}>
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            Clear chat
          </Button>
        )}
      </div>

      <div
        className={cn(
          'mt-5 flex max-h-[26rem] flex-col gap-3 overflow-y-auto rounded-xl border-2 border-ink/10 bg-paper-dark p-4',
          turns.length === 0 && 'items-center justify-center py-8 text-center',
        )}
      >
        {turns.length === 0 && (
          <p className="max-w-sm text-sm text-ink-soft">
            Try: &ldquo;When should I use a gateway endpoint instead of an interface endpoint?&rdquo; Follow-ups like
            &ldquo;why?&rdquo; work too.
          </p>
        )}
        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="group flex flex-col items-end gap-1">
              <p className="max-w-[85%] rounded-2xl rounded-br-md border-2 border-accent/25 bg-accent-soft px-4 py-2.5 text-sm text-ink">
                {turn.text}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDraft(turn.text)
                  requestAnimationFrame(() => inputRef.current?.focus())
                }}
                className="inline-flex items-center gap-1 px-1 text-[11px] font-medium text-ink-soft hover:text-ink"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.75} />
                Edit &amp; ask again
              </button>
            </div>
          ) : (
            <div key={turn.id} className="flex max-w-[92%] flex-col gap-2 rounded-2xl rounded-bl-md border-2 border-ink/10 bg-paper px-4 py-3 shadow-chunky-sm">
              <p className="text-sm leading-relaxed text-ink">{turn.text}</p>
              <div className="flex flex-wrap items-center gap-2">
                {turn.audioUrl &&
                  (playingId === turn.id ? (
                    <button type="button" onClick={stopAudio} className="inline-flex items-center gap-1 rounded-full border-2 border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-ink/25">
                      <Square className="h-3 w-3" strokeWidth={2} />
                      Stop
                    </button>
                  ) : (
                    <button type="button" onClick={() => play(turn)} className="inline-flex items-center gap-1 rounded-full border-2 border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-ink/25">
                      <Volume2 className="h-3 w-3" strokeWidth={2} />
                      Replay
                    </button>
                  ))}
                {!turn.audioUrl && turn.audioError && (
                  <span className="text-[11px] text-ink-soft">Voice unavailable — text only</span>
                )}
                {turn.concepts.map((concept) => (
                  <Link
                    key={concept.id}
                    to={`/course/${courseId}/map?focus=${concept.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark hover:bg-accent/20"
                  >
                    <MapIcon className="h-3 w-3" strokeWidth={2} />
                    {concept.name}
                  </Link>
                ))}
              </div>
              {turn.citations.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t-2 border-dashed border-ink/10 pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {turn.citations.map((citation, i) => {
                      const key = `${turn.id}:${citation.chunk_id}`
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setOpenCitation(openCitation === key ? null : key)}
                          aria-expanded={openCitation === key}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[11px] font-medium',
                            openCitation === key ? 'border-accent/40 text-accent-dark' : 'border-ink/10 text-ink-soft hover:text-ink',
                          )}
                        >
                          <FileText className="h-3 w-3" strokeWidth={1.75} />
                          {citation.label} #{i + 1}
                        </button>
                      )
                    })}
                  </div>
                  {turn.citations.map((citation) =>
                    openCitation === `${turn.id}:${citation.chunk_id}` ? (
                      <p key={citation.chunk_id} className="font-serif text-xs italic leading-relaxed text-ink-soft">
                        &ldquo;{citation.excerpt}&rdquo;
                      </p>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {busy && <p className="text-xs text-ink-soft">{PHASE_LABEL[phase]}</p>}
        <div ref={listEndRef} />
      </div>

      <audio
        ref={audioRef}
        onEnded={() => {
          setPlayingId(null)
          setPhase('idle')
        }}
        className="hidden"
      />

      <div className="mt-5 flex flex-col items-center gap-3">
        <button
          type="button"
          onPointerDown={onMicDown}
          onPointerUp={onMicUp}
          onKeyDown={(event) => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !busy) {
              event.preventDefault()
              if (recording) recorder.stopTake()
              else void recorder.startTake()
            }
          }}
          disabled={busy || micBlocked}
          aria-pressed={recording}
          aria-label={recording ? 'Stop recording' : 'Hold or tap to talk'}
          className={cn(
            'relative flex h-20 w-20 touch-none select-none items-center justify-center rounded-full text-paper transition-transform disabled:opacity-50',
            recording ? 'bg-red-600 shadow-chunky' : 'bg-accent shadow-chunky-accent active:translate-y-[2px]',
          )}
        >
          {recording && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-4 border-red-600"
              style={{ transform: `scale(${1 + recorder.level * 0.45})`, opacity: 0.35 }}
            />
          )}
          {recording ? <Square className="h-7 w-7" strokeWidth={2} /> : <Mic className="h-8 w-8" strokeWidth={2} />}
        </button>
        <p className="min-h-5 text-xs font-medium text-ink-soft" aria-live="polite">
          {micBlocked
            ? recorder.status === 'denied'
              ? 'Microphone access was blocked. Allow it in your browser, or type below.'
              : 'Voice input isn’t available in this browser. Type your question below.'
            : status || 'Hold the mic to talk, or tap to start and tap to stop'}
        </p>
        {phase === 'speaking' && (
          <button type="button" onClick={stopAudio} className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-accent-dark">
            <Square className="h-3 w-3" strokeWidth={2} />
            Stop speaking
          </button>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      <form onSubmit={submit} className="mt-4 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="sr-only">Your question</span>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) submit(event)
            }}
            rows={2}
            placeholder="Your transcript lands here to edit — or just type a question"
            className="w-full resize-none rounded-xl border-2 border-ink/15 bg-paper-dark px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <Button type="submit" disabled={busy || !draft.trim()} aria-label="Ask">
          {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
          Ask
        </Button>
      </form>
    </section>
  )
}
