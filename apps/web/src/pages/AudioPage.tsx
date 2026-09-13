import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Heading } from '@/components/ui/Heading'
import { PreviewBanner } from '@/components/ui/PreviewBanner'
import { mockCourse } from '@/data/mockCourse'
import { cn } from '@/lib/cn'

const DURATION_SECONDS = 96
const BAR_HEIGHTS = [30, 55, 40, 70, 45, 85, 35, 60, 50, 75, 40, 65, 30, 55, 45, 80, 35, 60, 50, 40]

const SAMPLE_TRANSCRIPT =
  '"...so when we talk about context switching, remember it\'s really just two operations: save the current process\'s state into its PCB, then restore the next process\'s state from its own PCB. That\'s the whole mechanism the scheduler leans on..."'

type TranscribeState = 'idle' | 'uploading' | 'transcribing' | 'done'

export function AudioPage() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [transcribeState, setTranscribeState] = useState<TranscribeState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isPlaying) return
    const interval = window.setInterval(() => {
      setElapsed((prev) => {
        if (prev >= DURATION_SECONDS) {
          setIsPlaying(false)
          return 0
        }
        return prev + 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isPlaying])

  const handleFile = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setFileName(file.name)
    setTranscribeState('uploading')
    // Preview-only simulation — the real endpoint (ElevenLabs speech-to-text,
    // wired up server-side) will replace this timed fake with an actual call.
    window.setTimeout(() => setTranscribeState('transcribing'), 700)
    window.setTimeout(() => setTranscribeState('done'), 2200)
  }

  const format = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky">
        <Eyebrow>
          {mockCourse.code} · {mockCourse.title}
        </Eyebrow>
        <Heading as="h1" size="page" className="mt-1">
          Audio
        </Heading>
      </header>

      <PreviewBanner>
        Narration isn&apos;t wired to ElevenLabs yet, and this player is a mock — but the upload box below previews the
        real transcription flow.
      </PreviewBanner>

      <div className="rounded-2xl border-2 border-ink/10 bg-paper p-6 shadow-chunky">
        <Eyebrow size="card">Narrated recap</Eyebrow>
        <Heading as="h2" size="section" className="mt-1">
          Processes &amp; Scheduling — Unit Recap
        </Heading>

        <div className="mt-5 flex items-end gap-[3px]" aria-hidden="true">
          {BAR_HEIGHTS.map((height, i) => (
            <span
              key={i}
              className={cn(
                'w-full rounded-full bg-accent/30 transition-all duration-300',
                isPlaying && i < (elapsed / DURATION_SECONDS) * BAR_HEIGHTS.length && 'bg-accent',
              )}
              style={{ height: `${height}%`, minHeight: 6, maxWidth: 6 }}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-paper shadow-chunky-accent transition-transform active:translate-y-[2px] active:shadow-none"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="ml-0.5 h-4.5 w-4.5" />}
          </button>
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-paper-dark">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-1000 linear"
                style={{ width: `${(elapsed / DURATION_SECONDS) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-ink-soft/60">
              <span>{format(elapsed)}</span>
              <span>{format(DURATION_SECONDS)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-ink/10 bg-paper p-6 shadow-chunky">
        <Eyebrow size="card">Upload a recording</Eyebrow>
        <Heading as="h2" size="section" className="mt-1">
          Transcribe your own audio
        </Heading>
        <p className="mt-1 text-sm text-ink-soft">
          A lecture recording or voice memo gets sent for speech-to-text and folded in as note content.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink/20 bg-paper-dark px-6 py-7 text-center transition-colors hover:border-ink/35"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-accent shadow-chunky-sm">
            {transcribeState === 'idle' || transcribeState === 'done' ? (
              <Upload className="h-4.5 w-4.5" strokeWidth={1.75} />
            ) : (
              <Mic className="h-4.5 w-4.5 animate-pulse" strokeWidth={1.75} />
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
            onChange={(event) => handleFile(event.target.files)}
          />
        </div>

        {transcribeState !== 'idle' && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border-2 border-ink/10 bg-paper-dark p-4">
            <div className="flex items-center justify-between">
              <p className="truncate text-sm font-medium text-ink">{fileName}</p>
              <Badge variant={transcribeState === 'done' ? 'accent' : 'outline'}>
                {transcribeState === 'uploading' && 'Uploading'}
                {transcribeState === 'transcribing' && 'Transcribing…'}
                {transcribeState === 'done' && 'Transcribed'}
              </Badge>
            </div>
            {transcribeState === 'done' && (
              <p className="font-serif text-sm italic leading-relaxed text-ink-soft">{SAMPLE_TRANSCRIPT}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
