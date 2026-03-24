import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClickRipple } from '../engine/render-loop'
import { startRenderLoop } from '../engine/render-loop'
import { SpringCamera } from '../engine/spring-camera'
import { useRecording } from '../hooks/useRecording'
import { useRecordingStore } from '../store/recording'

function fmtTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function FloatingToolbar() {
  const status = useRecordingStore((s) => s.status)
  const setStatus = useRecordingStore((s) => s.setStatus)
  const settings = useRecordingStore((s) => s.settings)

  const [sending, setSending] = useState(false)

  const {
    captureVideoRef,
    canvasRef,
    countdownValue,
    recordDuration,
    startRecording,
    stopRecording,
    zoomEventsRef,
    startMsRef,
  } = useRecording({ settings, setStatus })

  // Render loop refs
  const cameraRef = useRef(new SpringCamera())
  const cursorNormRef = useRef({ x: 0.5, y: 0.5 })
  const smoothCursorRef = useRef({ x: 0.5, y: 0.5 })
  const ripplesRef = useRef<ClickRipple[]>([])
  const rippleIdRef = useRef(0)
  const prevClickRef = useRef(false)
  const clickedRef = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Set transparent backgrounds on mount
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  // Listen for cursor data from main process
  useEffect(() => {
    if (typeof window.kino?.onCursorData !== 'function') return
    const off = window.kino.onCursorData((frame) => {
      cursorNormRef.current = {
        x: frame.x / (window.screen.width || 1920),
        y: frame.y / (window.screen.height || 1080),
      }

      if (frame.click && !prevClickRef.current) {
        clickedRef.current = true
        const canvas = canvasRef.current
        if (canvas) {
          const pad = settingsRef.current.padding
          const videoW = canvas.width - 2 * pad
          const videoH = canvas.height - 2 * pad
          const cx = pad + smoothCursorRef.current.x * videoW
          const cy = pad + smoothCursorRef.current.y * videoH
          ripplesRef.current.push({
            id: rippleIdRef.current,
            x: cx,
            y: cy,
            startTime: performance.now(),
          })
          rippleIdRef.current += 1
        }
      }
      prevClickRef.current = frame.click
    })
    return off
  }, [canvasRef])

  // Run render loop when recording — draws video + cursor effects onto hidden canvas
  useEffect(() => {
    if (status !== 'recording') return
    const canvas = canvasRef.current
    if (!canvas) return

    const stopLoop = startRenderLoop({
      canvas,
      captureVideoRef,
      camera: cameraRef.current,
      cursorNormRef,
      smoothCursorRef,
      ripplesRef,
      clickedRef,
      settings,
      zoomEventsRef,
      recordStartMs: startMsRef.current,
      drawCustomCursor: false,
    })

    return () => { stopLoop() }
  }, [captureVideoRef, canvasRef, settings, status, zoomEventsRef, startMsRef])

  const handleRecord = useCallback(async () => {
    await startRecording()
  }, [startRecording])

  const handleStop = useCallback(async () => {
    setSending(true)
    const result = await stopRecording()

    if (result.chunks.length > 0) {
      const blob = new Blob(result.chunks, { type: 'video/webm' })
      const ab = await blob.arrayBuffer()
      await window.kino.sendToolbarRecording({
        data: ab,
        duration: result.duration,
        metadata: result.metadata,
        zoomEvents: [...zoomEventsRef.current],
      })
    }
    setSending(false)
  }, [stopRecording, zoomEventsRef])

  const handleClose = useCallback(() => {
    window.kino.closeToolbar()
  }, [])

  const isRecording = status === 'recording'
  const isCountdown = countdownValue !== null
  const isBusy = isRecording || isCountdown || sending

  const screenW = Math.round((window.screen.width || 1920) * (window.devicePixelRatio || 1))
  const screenH = Math.round((window.screen.height || 1080) * (window.devicePixelRatio || 1))

  return (
    <>
      {/* Hidden capture elements — off-screen but still rendered for MediaRecorder */}
      <video
        ref={captureVideoRef}
        muted
        playsInline
        style={{ position: 'fixed', left: -9999, width: 1, height: 1, opacity: 0 }}
      />
      <canvas
        ref={canvasRef}
        width={screenW}
        height={screenH}
        style={{ position: 'fixed', left: -9999, width: 1, height: 1, opacity: 0 }}
      />

      {/* Center the capsule in the window (window is larger to accommodate shadow) */}
      <div className="flex h-screen w-screen items-center justify-center">
        <div
          className="flex h-11 items-center gap-1 rounded-[14px] px-1.5"
          style={{
            background: 'rgba(24, 24, 27, 0.82)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow:
              '0 0 0 0.5px rgba(0,0,0,0.3), 0 8px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}
        >
          {isBusy ? (
            <>
              {/* Pulsing dot + timer */}
              <span className="flex items-center gap-1.5 px-2 text-[13px] font-medium tabular-nums text-zinc-300"
                style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'SF Mono, ui-monospace, monospace' }}>
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />
                {isCountdown ? (
                  <span className="text-red-400">{countdownValue}</span>
                ) : sending ? (
                  <span className="text-zinc-500 text-[12px]">Saving...</span>
                ) : (
                  fmtTimer(recordDuration)
                )}
              </span>

              {/* Separator */}
              <div className="h-5 w-px bg-white/10" />

              {/* Stop button */}
              <button
                data-testid="toolbar-stop-btn"
                onClick={handleStop}
                disabled={isCountdown || sending}
                className="rounded-lg p-2 text-zinc-400 transition-all duration-150 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/15 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title="Stop recording"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="2" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {/* Record button */}
              <button
                data-testid="toolbar-record-btn"
                onClick={handleRecord}
                className="rounded-lg p-2 text-red-500 transition-all duration-150 hover:bg-white/10 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-white/15 active:scale-95"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title="Start recording"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="8" r="6" />
                </svg>
              </button>

              {/* Separator */}
              <div className="h-5 w-px bg-white/10" />

              {/* Settings button */}
              <button
                data-testid="toolbar-settings-btn"
                className="rounded-lg p-2 text-zinc-400 transition-all duration-150 hover:bg-white/10 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-white/15 active:scale-95"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title="Settings"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              {/* Close button */}
              <button
                onClick={handleClose}
                className="rounded-lg p-2 text-zinc-500 transition-all duration-150 hover:bg-white/10 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-white/15 active:scale-95"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10" />
                  <line x1="10" y1="2" x2="2" y2="10" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
