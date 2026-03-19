import type { MutableRefObject, RefObject } from 'react'
import type { ProjectSettings } from '../../shared/types'
import { SpringCamera } from './spring-camera'
import { ZoomController } from './zoom-controller'

export interface NormalizedCursor {
  x: number
  y: number
}

export interface ClickRipple {
  id: number
  x: number
  y: number
  startTime: number
}

interface StartRenderLoopInput {
  canvas: HTMLCanvasElement
  captureVideoRef: RefObject<HTMLVideoElement>
  camera: SpringCamera
  cursorNormRef: MutableRefObject<NormalizedCursor>
  smoothCursorRef: MutableRefObject<NormalizedCursor>
  ripplesRef: MutableRefObject<ClickRipple[]>
  clickedRef: MutableRefObject<boolean>
  settings: ProjectSettings
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  ctx.beginPath()
  if (r > 0) {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
  } else {
    ctx.rect(x, y, w, h)
  }
  ctx.closePath()
}

function clipRoundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  if (radius === 0) return
  roundedRectPath(ctx, 0, 0, w, h, radius)
  ctx.clip()
}

/**
 * Catmull-Rom spline interpolation between four points.
 * Returns the interpolated value at parameter t (0-1) between p1 and p2.
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

export function startRenderLoop(input: StartRenderLoopInput): () => void {
  const { canvas, captureVideoRef, camera, cursorNormRef, smoothCursorRef, ripplesRef, clickedRef, settings } = input
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const zoomController = new ZoomController()
  let prevCursor = { ...cursorNormRef.current }
  let lastFrameMs = performance.now()
  let lastRenderLogMs = 0

  // Ring buffer of last 4 cursor positions for Catmull-Rom interpolation
  const cursorHistory: NormalizedCursor[] = Array.from({ length: 4 }, () => ({ ...cursorNormRef.current }))
  let historyIndex = 0

  const intervalId = setInterval(() => {
    const now = performance.now()
    const dt = Math.min((now - lastFrameMs) / 1000, 0.1)
    lastFrameMs = now

    const vw = canvas.width
    const vh = canvas.height
    const pad = settings.padding
    const videoW = vw - 2 * pad
    const videoH = vh - 2 * pad

    // Push current raw position into ring buffer
    cursorHistory[historyIndex] = { ...cursorNormRef.current }
    historyIndex = (historyIndex + 1) % 4

    // Compute smoothed cursor position
    let smoothX: number
    let smoothY: number

    if (settings.cursorSmoothing) {
      const p0 = cursorHistory[(historyIndex + 0) % 4]
      const p1 = cursorHistory[(historyIndex + 1) % 4]
      const p2 = cursorHistory[(historyIndex + 2) % 4]
      const p3 = cursorHistory[(historyIndex + 3) % 4]
      smoothX = catmullRom(p0.x, p1.x, p2.x, p3.x, 0.5)
      smoothY = catmullRom(p0.y, p1.y, p2.y, p3.y, 0.5)
    } else {
      smoothX = cursorNormRef.current.x
      smoothY = cursorNormRef.current.y
    }

    // Expose smoothed position for external consumers (e.g. click ripple origin)
    smoothCursorRef.current = { x: smoothX, y: smoothY }

    // Cursor position mapped to padded video area
    const cx = pad + smoothX * videoW
    const cy = pad + smoothY * videoH

    const dx = (cursorNormRef.current.x - prevCursor.x) * vw
    const dy = (cursorNormRef.current.y - prevCursor.y) * vh
    const speed = dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0
    prevCursor = { ...cursorNormRef.current }

    // Read and consume click flag (set by App.tsx on click transition)
    const clicked = clickedRef.current
    clickedRef.current = false

    const targetZoom = zoomController.update({
      autoZoomEnabled: settings.autoZoom,
      autoZoomLevel: settings.autoZoomLevel,
      dwellZoomLevel: settings.dwellZoomLevel,
      dwellThresholdMs: settings.dwellDelay,
      speed,
      dtMs: dt * 1000,
      currentZoom: camera.zoom,
      clicked,
    })

    const tx = (smoothX - 0.5) * videoW
    const ty = (smoothY - 0.5) * videoH
    camera.update(tx, ty, targetZoom, dt)

    ctx.fillStyle = settings.background
    ctx.fillRect(0, 0, vw, vh)

    const video = captureVideoRef.current
    if (video && video.readyState >= 2) {
      // Draw drop shadow behind the video frame
      if (settings.shadowEnabled && settings.shadowBlur > 0 && pad > 0) {
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
        ctx.shadowBlur = settings.shadowBlur
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 2
        ctx.fillStyle = '#000'
        roundedRectPath(ctx, pad, pad, videoW, videoH, settings.cornerRadius)
        ctx.fill()
        ctx.restore()
      }

      // Draw video with camera transforms, inset by padding
      ctx.save()
      ctx.translate(pad + videoW / 2, pad + videoH / 2)
      ctx.scale(camera.zoom, camera.zoom)
      ctx.translate(-videoW / 2 - camera.x, -videoH / 2 - camera.y)
      if (settings.cornerRadius > 0) {
        clipRoundedRect(ctx, videoW, videoH, settings.cornerRadius)
      }
      ctx.drawImage(video, 0, 0, videoW, videoH)
      ctx.restore()
    }

    if (settings.clickHighlight) {
      ripplesRef.current = ripplesRef.current.filter((r) => now - r.startTime < 700)
      for (const ripple of ripplesRef.current) {
        const t = (now - ripple.startTime) / 700
        const radius = 6 + t * 45
        const alpha = (1 - t) * 0.9
        ctx.save()
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,220,80,${alpha})`
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.restore()
      }
    }

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 7 * settings.cursorSize, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.93)'
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 7
    ctx.fill()
    ctx.restore()

    if (now - lastRenderLogMs >= 1000) {
      console.log(`[render] loop tick, canvas visible, zoom=${camera.zoom.toFixed(3)}`)
      lastRenderLogMs = now
    }
  }, 16)

  return () => {
    clearInterval(intervalId)
  }
}
