import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'recording' | 'unsupported' | 'denied' | 'error'

type Options = {
  onTake: (audio: Blob, filename: string) => void
}

const MIN_TAKE_MS = 400

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  )
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

/** Push-to-talk recording: `startTake` / `stopTake` yield one audio Blob per take, plus a live input level. */
export function useVoiceRecorder({ onTake }: Options) {
  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const [status, setStatus] = useState<RecorderStatus>(supported ? 'idle' : 'unsupported')
  const [level, setLevel] = useState(0)

  const onTakeRef = useRef(onTake)
  useEffect(() => {
    onTakeRef.current = onTake
  }, [onTake])

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const takeStartedAt = useRef(0)
  const loopRef = useRef<number | null>(null)
  const lastLevelPush = useRef(0)

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(stream).connect(analyser)
      contextRef.current = context
      analyserRef.current = analyser
      return stream
    } catch (err) {
      setStatus((err as DOMException).name === 'NotAllowedError' ? 'denied' : 'error')
      return null
    }
  }, [])

  const stopMeter = useCallback(() => {
    if (loopRef.current !== null) cancelAnimationFrame(loopRef.current)
    loopRef.current = null
    setLevel(0)
  }, [])

  const startMeter = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser || loopRef.current !== null) return
    const buffer = new Float32Array(analyser.fftSize)
    const frame = () => {
      const now = performance.now()
      if (now - lastLevelPush.current > 90) {
        lastLevelPush.current = now
        analyser.getFloatTimeDomainData(buffer)
        let sum = 0
        for (const sample of buffer) sum += sample * sample
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 12))
      }
      loopRef.current = requestAnimationFrame(frame)
    }
    loopRef.current = requestAnimationFrame(frame)
  }, [])

  const startTake = useCallback(async () => {
    if (recorderRef.current) return
    const stream = await ensureStream()
    if (!stream) return
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const parts: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data)
    }
    recorder.onstop = () => {
      recorderRef.current = null
      stopMeter()
      setStatus('idle')
      if (performance.now() - takeStartedAt.current < MIN_TAKE_MS || parts.length === 0) return
      const type = recorder.mimeType || mimeType || 'audio/webm'
      onTakeRef.current(new Blob(parts, { type }), `voice.${extensionFor(type)}`)
    }
    takeStartedAt.current = performance.now()
    recorder.start()
    recorderRef.current = recorder
    setStatus('recording')
    startMeter()
  }, [ensureStream, startMeter, stopMeter])

  const stopTake = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  useEffect(
    () => () => {
      if (loopRef.current !== null) cancelAnimationFrame(loopRef.current)
      if (recorderRef.current) {
        recorderRef.current.onstop = null
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      contextRef.current?.close()
    },
    [],
  )

  return { status, level, startTake, stopTake }
}
