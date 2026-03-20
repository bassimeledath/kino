import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectSettings, RecordingStatus, ZoomEvent } from '../../shared/types'

interface UseRecordingInput {
  settings: ProjectSettings
  setStatus: (status: RecordingStatus) => void
}

export interface RecordingMetadata {
  codec: string
  fileSize: number // bytes
  screenWidth: number
  screenHeight: number
}

export interface StopRecordingResult {
  duration: number
  chunks: Blob[]
  zoomEvents: ZoomEvent[]
  metadata: RecordingMetadata
}

export function useRecording(input: UseRecordingInput) {
  const { settings, setStatus } = input

  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [recordDuration, setRecordDuration] = useState(0)

  const captureVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const sourceStreamRef = useRef<MediaStream | null>(null)
  const canvasStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startMsRef = useRef(0)
  const recordDurationRef = useRef(0)
  const countdownAbortRef = useRef(false)
  const zoomEventsRef = useRef<ZoomEvent[]>([])
  const codecRef = useRef('video/webm')
  const screenDimsRef = useRef({ width: 1920, height: 1080 })

  useEffect(() => {
    recordDurationRef.current = recordDuration
  }, [recordDuration])

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    countdownAbortRef.current = false
    setStatus('recording')
    window.kino.startRecording({})

    chunksRef.current = []
    zoomEventsRef.current = []
    setRecordDuration(0)
    startMsRef.current = Date.now()
    screenDimsRef.current = { width: window.screen.width || 1920, height: window.screen.height || 1080 }

    console.log('[recording] started capture...')

    for (let i = 3; i >= 1; i -= 1) {
      if (countdownAbortRef.current) return false
      setCountdownValue(i)
      await new Promise<void>((resolve) => setTimeout(resolve, 800))
    }

    if (countdownAbortRef.current) return false
    setCountdownValue(null)

    try {
      const sources = await window.kino.getSources()
      const src = sources.find((s) => s.name.toLowerCase().includes('screen')) ?? sources[0]
      if (!src) {
        throw new Error('no capture source available')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: src.id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: settings.fps,
          },
        } as MediaTrackConstraints,
      })

      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micStream.getAudioTracks().forEach((track) => stream.addTrack(track))
      } catch {
        // Continue without microphone track.
      }

      sourceStreamRef.current = stream

      const videoEl = captureVideoRef.current
      if (videoEl) {
        videoEl.srcObject = stream
        await videoEl.play().catch(() => {})
      }

      const canvasEl = canvasRef.current
      if (!canvasEl) {
        throw new Error('canvas missing')
      }

      // Give the render loop a beat to draw the first composed frame.
      await new Promise<void>((resolve) => setTimeout(resolve, 50))

      const canvasStream = canvasEl.captureStream(60)
      stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track))
      canvasStreamRef.current = canvasStream

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      codecRef.current = mimeType

      const recorder = new MediaRecorder(canvasStream, { mimeType })
      console.log('[recording] MediaRecorder using canvas stream')

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = (event) => {
        console.error('[recording] MediaRecorder error', event)
      }

      recorderRef.current = recorder
      recorder.start(200)

      startMsRef.current = Date.now()
      clearDurationTimer()
      durationTimerRef.current = setInterval(() => {
        setRecordDuration(Date.now() - startMsRef.current)
      }, 100)

      return true
    } catch (error) {
      console.error('[recording] capture setup failed', error)
      sourceStreamRef.current?.getTracks().forEach((track) => track.stop())
      sourceStreamRef.current = null
      canvasStreamRef.current?.getTracks().forEach((track) => track.stop())
      canvasStreamRef.current = null
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = null
      }
      window.kino.stopRecording()
      setStatus('idle')
      return false
    }
  }, [clearDurationTimer, setStatus, settings.fps])

  const stopRecording = useCallback(async (): Promise<StopRecordingResult> => {
    countdownAbortRef.current = true
    setCountdownValue(null)
    clearDurationTimer()

    const recorder = recorderRef.current
    recorderRef.current = null

    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const onStop = () => {
          recorder.removeEventListener('stop', onStop)
          resolve()
        }

        recorder.addEventListener('stop', onStop)
        try {
          recorder.requestData()
        } catch {
          // Recorder may reject requestData near stop; safe to ignore.
        }
        recorder.stop()
      })
    }

    sourceStreamRef.current?.getTracks().forEach((track) => track.stop())
    sourceStreamRef.current = null

    canvasStreamRef.current?.getTracks().forEach((track) => track.stop())
    canvasStreamRef.current = null

    if (captureVideoRef.current) {
      captureVideoRef.current.srcObject = null
    }

    window.kino.stopRecording()
    setStatus('idle')

    const duration = Math.max(recordDurationRef.current, 1000)
    setRecordDuration(duration)

    const chunks = [...chunksRef.current]
    const fileSize = chunks.reduce((sum, c) => sum + c.size, 0)

    return {
      duration,
      chunks,
      zoomEvents: [...zoomEventsRef.current],
      metadata: {
        codec: codecRef.current,
        fileSize,
        screenWidth: screenDimsRef.current.width,
        screenHeight: screenDimsRef.current.height,
      },
    }
  }, [clearDurationTimer, setStatus])

  const getChunks = useCallback(() => {
    return [...chunksRef.current]
  }, [])

  useEffect(() => {
    return () => {
      countdownAbortRef.current = true
      clearDurationTimer()
      sourceStreamRef.current?.getTracks().forEach((track) => track.stop())
      canvasStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [clearDurationTimer])

  return {
    captureVideoRef,
    canvasRef,
    countdownValue,
    recordDuration,
    startRecording,
    stopRecording,
    getChunks,
    zoomEventsRef,
    startMsRef,
  }
}
