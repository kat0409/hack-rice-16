import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'listening' | 'recording' | 'unsupported' | 'denied' | 'error'

type Options = {
  onTake: (audio: Blob, filename: string) => void
}

// Voice-activity tuning for hands-free mode. RMS of the time-domain signal, in
// [0, 1]. Thresholds float above a slowly-tracked noise floor so a noisy room
// doesn't trigger constantly and a quiet one still registers soft speech.
const MIN_START_RMS = 0.02
const MIN_SILENCE_RMS = 0.012
const SPEECH_ONSET_MS = 120
const SILENCE_END_MS = 1200
const MAX_TAKE_MS = 30000
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

export function useVoiceRecorder({ onTake }: Options) {
  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const [status, setStatus] = useState<RecorderStatus>(supported ? 'idle' : 'unsupported')
  const [level, setLevel] = useState(0)
  const [handsFree, setHandsFree] = useState(false)

  const onTakeRef = useRef(onTake)
  useEffect(() => {
    onTakeRef.current = onTake
  }, [onTake])

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const discardRef = useRef(false)
  const takeStartedAt = useRef(0)

  const loopRef = useRef<number | null>(null)
  const handsFreeRef = useRef(false)
  const pausedRef = useRef(false)
  const noiseFloor = useRef(0.005)
  const voiceSince = useRef<number | null>(null)
  const lastVoiceAt = useRef(0)
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

  const readRms = useCallback((): number => {
    const analyser = analyserRef.current
    if (!analyser) return 0
    const buffer = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buffer)
    let sum = 0
    for (const sample of buffer) sum += sample * sample
    return Math.sqrt(sum / buffer.length)
  }, [])

  const beginRecording = useCallback((stream: MediaStream) => {
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const parts: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data)
    }
    recorder.onstop = () => {
      const tookMs = performance.now() - takeStartedAt.current
      const discard = discardRef.current
      discardRef.current = false
      recorderRef.current = null
      setStatus(handsFreeRef.current ? 'listening' : 'idle')
      if (discard || tookMs < MIN_TAKE_MS || parts.length === 0) return
      const type = recorder.mimeType || mimeType || 'audio/webm'
      onTakeRef.current(new Blob(parts, { type }), `voice.${extensionFor(type)}`)
    }
    takeStartedAt.current = performance.now()
    lastVoiceAt.current = takeStartedAt.current
    recorder.start()
    recorderRef.current = recorder
    setStatus('recording')
  }, [])

  const endRecording = useCallback((discard = false) => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    discardRef.current = discard
    recorder.stop()
  }, [])

  const tick = useCallback(() => {
    const now = performance.now()
    const rms = readRms()
    if (now - lastLevelPush.current > 90) {
      lastLevelPush.current = now
      setLevel(Math.min(1, rms * 12))
    }

    if (handsFreeRef.current && !pausedRef.current && streamRef.current) {
      const recording = !!recorderRef.current
      const startThreshold = Math.max(MIN_START_RMS, noiseFloor.current * 3)
      const silenceThreshold = Math.max(MIN_SILENCE_RMS, noiseFloor.current * 2)

      if (!recording) {
        noiseFloor.current = noiseFloor.current * 0.98 + Math.min(rms, 0.05) * 0.02
        if (rms > startThreshold) {
          voiceSince.current ??= now
          if (now - voiceSince.current >= SPEECH_ONSET_MS) {
            voiceSince.current = null
            beginRecording(streamRef.current)
          }
        } else {
          voiceSince.current = null
        }
      } else {
        if (rms > silenceThreshold) lastVoiceAt.current = now
        const tookMs = now - takeStartedAt.current
        if (now - lastVoiceAt.current > SILENCE_END_MS || tookMs > MAX_TAKE_MS) endRecording()
      }
    }
  }, [beginRecording, endRecording, readRms])

  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  const ensureLoop = useCallback(() => {
    if (loopRef.current !== null) return
    const frame = () => {
      tickRef.current()
      loopRef.current = requestAnimationFrame(frame)
    }
    loopRef.current = requestAnimationFrame(frame)
  }, [])

  const startTake = useCallback(async () => {
    if (recorderRef.current) return
    const stream = await ensureStream()
    if (!stream) return
    ensureLoop()
    beginRecording(stream)
  }, [beginRecording, ensureLoop, ensureStream])

  const stopTake = useCallback(() => endRecording(false), [endRecording])

  const startHandsFree = useCallback(async () => {
    const stream = await ensureStream()
    if (!stream) return
    handsFreeRef.current = true
    pausedRef.current = false
    voiceSince.current = null
    setHandsFree(true)
    setStatus('listening')
    ensureLoop()
  }, [ensureLoop, ensureStream])

  const stopHandsFree = useCallback(() => {
    handsFreeRef.current = false
    setHandsFree(false)
    endRecording(true)
    setStatus('idle')
  }, [endRecording])

  // Pause while the tutor is thinking or speaking, so it never hears itself.
  const setPaused = useCallback(
    (paused: boolean) => {
      pausedRef.current = paused
      if (paused) {
        voiceSince.current = null
        endRecording(true)
      }
    },
    [endRecording],
  )

  useEffect(
    () => () => {
      if (loopRef.current !== null) cancelAnimationFrame(loopRef.current)
      handsFreeRef.current = false
      discardRef.current = true
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      contextRef.current?.close()
    },
    [],
  )

  return { status, level, handsFree, startTake, stopTake, startHandsFree, stopHandsFree, setPaused }
}
