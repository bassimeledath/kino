import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ProjectSettings, TimelineSegment } from '../../shared/types'
import { drawBackground, roundedRectPath } from '../engine/render-loop'

interface CanvasPlaybackProps {
  playbackUrl: string
  segments: TimelineSegment[]
  playheadMs: number
  onPlayheadChange: (ms: number) => void
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
  settings: ProjectSettings
  ghostMs: number | null
}

export function CanvasPlayback({
  playbackUrl,
  segments,
  playheadMs,
  onPlayheadChange,
  isPlaying,
  onPlayingChange,
  settings,
  ghostMs,
}: CanvasPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastReportedRef = useRef(0)
  const rafRef = useRef(0)

  // Retina-aware canvas sizing via ResizeObserver
  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
    }

    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const activeSegments = useMemo(
    () => segments.filter((s) => !s.deleted).sort((a, b) => a.startTime - b.startTime),
    [segments],
  )

  const activeSegmentsRef = useRef(activeSegments)
  activeSegmentsRef.current = activeSegments

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Preload background image
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (settings.backgroundType === 'image' && settings.backgroundImageDataUrl) {
      const img = new Image()
      img.src = settings.backgroundImageDataUrl
      bgImageRef.current = img
    } else {
      bgImageRef.current = null
    }
  }, [settings.backgroundType, settings.backgroundImageDataUrl])

  // Draw a single frame with all effects
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = settingsRef.current
    const dpr = window.devicePixelRatio || 1
    const vw = canvas.width / dpr
    const vh = canvas.height / dpr
    const pad = s.padding
    const videoW = vw - 2 * pad
    const videoH = vh - 2 * pad

    // Background
    drawBackground(ctx, vw, vh, s, bgImageRef.current)

    if (video.readyState >= 2) {
      // Drop shadow
      if (s.shadowEnabled && s.shadowBlur > 0 && pad > 0) {
        ctx.save()
        ctx.shadowColor = `rgba(0, 0, 0, ${s.shadowIntensity})`
        ctx.shadowBlur = s.shadowBlur
        if (s.shadowIsDirectional) {
          const rad = (s.shadowAngle * Math.PI) / 180
          ctx.shadowOffsetX = Math.cos(rad) * s.shadowDistance
          ctx.shadowOffsetY = Math.sin(rad) * s.shadowDistance
        } else {
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 0
        }
        ctx.fillStyle = '#000'
        roundedRectPath(ctx, pad, pad, videoW, videoH, s.cornerRadius)
        ctx.fill()
        ctx.restore()
      }

      // Video frame with rounded corners
      ctx.save()
      if (s.cornerRadius > 0) {
        roundedRectPath(ctx, pad, pad, videoW, videoH, s.cornerRadius)
        ctx.clip()
      }
      ctx.drawImage(video, pad, pad, videoW, videoH)
      ctx.restore()

      // Draw inset border on top of the video frame
      if (s.insetEnabled && s.insetWidth > 0) {
        ctx.save()
        const hex = s.insetColor
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${s.insetAlpha})`
        ctx.lineWidth = s.insetWidth
        const halfLW = s.insetWidth / 2
        roundedRectPath(ctx, pad + halfLW, pad + halfLW, videoW - s.insetWidth, videoH - s.insetWidth, Math.max(0, s.cornerRadius - halfLW))
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [])

  // Continuous rAF render loop — draws every frame with current settings,
  // handles segment skipping and playhead reporting
  useEffect(() => {
    let running = true

    const loop = () => {
      if (!running) return

      drawFrame()

      const video = videoRef.current
      if (video && !video.paused) {
        const currentMs = Math.round(video.currentTime * 1000)
        lastReportedRef.current = currentMs
        onPlayheadChange(currentMs)

        // Segment boundary check
        const segs = activeSegmentsRef.current
        const inSeg = segs.find((s) => currentMs >= s.startTime && currentMs < s.endTime)

        if (!inSeg) {
          const next = segs.find((s) => s.startTime > currentMs)
          if (next) {
            video.currentTime = next.startTime / 1000
            lastReportedRef.current = next.startTime
            onPlayheadChange(next.startTime)
          } else {
            // End of all segments — stop and loop back to start
            video.pause()
            onPlayingChange(false)
            if (segs.length > 0) {
              video.currentTime = segs[0].startTime / 1000
              lastReportedRef.current = segs[0].startTime
              onPlayheadChange(segs[0].startTime)
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [drawFrame, onPlayheadChange, onPlayingChange])

  // Seek video when playheadMs or ghostMs changes externally (timeline hover/click)
  // Ghost scrubbing uses fastSeek for performance; committed seeks use precise currentTime
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const targetMs = ghostMs ?? playheadMs
    if (Math.abs(targetMs - lastReportedRef.current) > 1) {
      if (ghostMs != null && typeof video.fastSeek === 'function') {
        video.fastSeek(targetMs / 1000)
      } else {
        video.currentTime = targetMs / 1000
      }
      lastReportedRef.current = targetMs
    }
  }, [playheadMs, ghostMs])

  // Play / pause
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      const segs = activeSegmentsRef.current
      if (segs.length === 0) {
        onPlayingChange(false)
        return
      }
      const currentMs = video.currentTime * 1000
      const inSeg = segs.find((s) => currentMs >= s.startTime && currentMs < s.endTime)
      if (!inSeg) {
        const next = segs.find((s) => s.startTime >= currentMs) || segs[0]
        if (next) {
          video.currentTime = next.startTime / 1000
          lastReportedRef.current = next.startTime
          onPlayheadChange(next.startTime)
        }
      }
      video.play()
    } else {
      video.pause()
    }
  }, [isPlaying, onPlayheadChange, onPlayingChange])

  const handleEnded = useCallback(() => {
    onPlayingChange(false)
    const segs = activeSegmentsRef.current
    if (segs.length > 0 && videoRef.current) {
      videoRef.current.currentTime = segs[0].startTime / 1000
      lastReportedRef.current = segs[0].startTime
      onPlayheadChange(segs[0].startTime)
    }
  }, [onPlayheadChange, onPlayingChange])

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ cursor: 'pointer', aspectRatio: '16 / 9' }}
    >
      <video
        ref={videoRef}
        src={playbackUrl}
        className="hidden"
        playsInline
        onEnded={handleEnded}
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full border border-zinc-800 shadow-2xl"
        style={{ borderRadius: `${settings.cornerRadius}px` }}
        onClick={() => onPlayingChange(!isPlaying)}
      />
    </div>
  )
}
