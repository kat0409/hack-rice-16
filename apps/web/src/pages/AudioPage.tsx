import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Mic, Pause, Play, Upload } from 'lucide-react'
import { StepPicker } from '@/components/study/StepPicker'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { useArtifact } from '@/hooks/useArtifact'
import { useCourse } from '@/hooks/useCourse'
import { useStep } from '@/hooks/useStep'
import { api, type ApiError, type SummaryContent } from '@/lib/api'
import { cn } from '@/lib/cn'

const BAR_HEIGHTS = [30, 55, 40, 70, 45, 85, 35, 60, 50, 75, 40, 65, 30, 55, 45, 80, 35, 60, 50, 40]

type TranscribeState = 'idle' | 'transcribing' | 'done' | 'error'

function format(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AudioPage() {
  const { courseId = '' } = useParams()
  const { course } = useCourse(courseId)
  const { step, steps, loading: stepLoading, select } = useStep(courseId)
  const { artifact: summary, loading: summaryLoading, error: summaryError } = useArtifact<SummaryContent>(
    step?.id,
    'SUMMARY',
  )

  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [narrationError, setNarrationError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [transcribeState, setTranscribeState] = useState<TranscribeState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setAudioUrl(null)
    setNarrationError(null)
    setIsPlaying(false)
    setElapsed(0)
    setDuration(0)
  }, [summary?.id])

  const narrate = async () => {
    if (!summary) return
    setNarrating(true)
    setNarrationError(null)
    try {
      const narration = await api.createNarration(summary.id)
      setAudioUrl(api.narrationAudioUrl(narration.id))
    } catch (err) {
      const apiErr = err as ApiError
      setNarrationError(
        apiErr.code === 'NARRATION_UNAVAILABLE'
          ? 'Narration is unavailable right now — the summary text below still works.'
          : apiErr.message,
      )
    } finally {
      setNarrating(false)
    }
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play()
      setIsPlaying(true)
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !courseId) return
    setFileName(file.name)
    setTranscribeState('transcribing')
    try {
      const result = await api.transcribeAudio(courseId, file)
      setTranscript(result.text)
      setTranscribeState('done')
    } catch (err) {
      setTranscript((err as Error).message)
      setTranscribeState('error')
    }
  }

  const progress = duration > 0 ? elapsed / duration : 0

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>{course?.name ?? 'Subject'}</Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          Audio
        </Heading>
      </header>

      <StepPicker courseId={courseId} steps={steps} step={step} loading={stepLoading} onSelect={select} />

      {step && (
        <div className="rounded-2xl border-2 border-ink/10 bg-paper p-6 shadow-chunky">
          <Eyebrow size="card">Narrated recap</Eyebrow>
          <Heading as="h2" size="section" className="mt-1">
            {summary?.content.title ?? step.conceptName}
          </Heading>
          {summaryLoading && <p className="mt-2 text-sm text-ink-soft">Writing the summary to narrate…</p>}
          {summaryError && <p className="mt-2 text-sm text-red-700">{summaryError.message}</p>}

          {summary && !audioUrl && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={narrate}
                disabled={narrating}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-paper shadow-chunky-accent active:translate-y-[2px] active:shadow-none disabled:opacity-60"
              >
                <Mic className="h-4 w-4" strokeWidth={2} />
                {narrating ? 'Generating voice…' : 'Narrate this step'}
              </button>
              <span className="text-xs text-ink-soft">Sends only the summary text to ElevenLabs.</span>
            </div>
          )}
          {narrationError && <p className="mt-3 text-sm text-ink-soft">{narrationError}</p>}

          {audioUrl && (
            <>
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                preload="metadata"
              />
              <div className="mt-5 flex items-end gap-[3px]" aria-hidden="true">
                {BAR_HEIGHTS.map((height, i) => (
                  <span
                    key={i}
                    className={cn(
                      'w-full rounded-full bg-accent/30 transition-all duration-300',
                      isPlaying && i < progress * BAR_HEIGHTS.length && 'bg-accent',
                    )}
                    style={{ height: `${height}%`, minHeight: 6, maxWidth: 6 }}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-paper shadow-chunky-accent transition-transform active:translate-y-[2px] active:shadow-none"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="ml-0.5 h-4.5 w-4.5" />}
                </button>
                <div className="flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-paper-dark">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-ink-soft/60">
                    <span>{format(elapsed)}</span>
                    <span>{format(duration)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {summary && (
            <div className="mt-5 flex flex-col gap-2 border-t-2 border-dashed border-ink/10 pt-4">
              {summary.content.summary_markdown.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-ink-soft">
                  {para}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border-2 border-ink/10 bg-paper p-6 shadow-chunky">
        <Eyebrow size="card">Upload a recording</Eyebrow>
        <Heading as="h2" size="section" className="mt-1">
          Transcribe your own audio
        </Heading>
        <p className="mt-1 text-sm text-ink-soft">
          A lecture recording or voice memo gets sent to ElevenLabs for speech-to-text. The transcript comes back
          here for you to review.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink/20 bg-paper-dark px-6 py-7 text-center transition-colors hover:border-ink/35"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-accent shadow-chunky-sm">
            {transcribeState === 'transcribing' ? (
              <Mic className="h-4.5 w-4.5 animate-pulse" strokeWidth={1.75} />
            ) : (
              <Upload className="h-4.5 w-4.5" strokeWidth={1.75} />
            )}
          </span>
          <Heading as="p" size="concept">
            Click to choose an audio file
          </Heading>
          <p className="text-xs text-ink-soft">MP3, WAV, or M4A</p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files)
              event.target.value = ''
            }}
          />
        </div>

        {transcribeState !== 'idle' && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border-2 border-ink/10 bg-paper-dark p-4">
            <div className="flex items-center justify-between">
              <p className="truncate text-sm font-medium text-ink">{fileName}</p>
              <Badge variant={transcribeState === 'done' ? 'accent' : 'outline'}>
                {transcribeState === 'transcribing' && 'Transcribing…'}
                {transcribeState === 'done' && 'Transcribed'}
                {transcribeState === 'error' && 'Failed'}
              </Badge>
            </div>
            {(transcribeState === 'done' || transcribeState === 'error') && (
              <p className="font-serif text-sm italic leading-relaxed text-ink-soft">{transcript}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
