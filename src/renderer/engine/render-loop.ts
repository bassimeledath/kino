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
  settings: ProjectSettings
}

function clipRoundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  if (r === 0) return

  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0)
  ctx.quadraticCurveTo(w, 0, w, r)
  ctx.lineTo(w, h - r)
  ctx.quadraticCurveTo(w, h, w - r, h)
  ctx.lineTo(r, h)
  ctx.quadraticCurveTo(0, h, 0, h - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
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
  const { canvas, captureVideoRef, camera, cursorNormRef, smoothCursorRef, ripplesRef, settings } = input
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

    // Push current raw position into ring buffer
    cursorHistory[historyIndex] = { ...cursorNormRef.current }
    historyIndex = (historyIndex + 1) % 4

    // Compute smoothed cursor position
    let smoothX: number
    let smoothY: number

    if (settings.cursorSmoothing) {
      // Read ring buffer in order: oldest (p0) to newest (p3)
      const p0 = cursorHistory[(historyIndex + 0) % 4]
      const p1 = cursorHistory[(historyIndex + 1) % 4]
      const p2 = cursorHistory[(historyIndex + 2) % 4]
      const p3 = cursorHistory[(historyIndex + 3) % 4]
      // Interpolate at t=0.5 between p1 and p2 for a smooth midpoint
      smoothX = catmullRom(p0.x, p1.x, p2.x, p3.x, 0.5)
      smoothY = catmullRom(p0.y, p1.y, p2.y, p3.y, 0.5)
    } else {
      smoothX = cursorNormRef.current.x
      smoothY = cursorNormRef.current.y
    }

    // Expose smoothed position for external consumers (e.g. click ripple origin)
    smoothCursorRef.current = { x: smoothX, y: smoothY }

    const cx = smoothX * vw
    const cy = smoothY * vh

    const dx = (cursorNormRef.current.x - prevCursor.x) * vw
    const dy = (cursorNormRef.current.y - prevCursor.y) * vh
    const speed = dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0
    prevCursor = { ...cursorNormRef.current }

    const targetZoom = zoomController.update({
      autoZoomEnabled: settings.autoZoom,
      autoZoomLevel: settings.autoZoomLevel,
      speed,
      dtMs: dt * 1000,
      currentZoom: camera.zoom,
    })

    const tx = (smoothX - 0.5) * vw
    const ty = (smoothY - 0.5) * vh
    camera.update(tx, ty, targetZoom, dt)

    ctx.fillStyle = settings.background
    ctx.fillRect(0, 0, vw, vh)

    const video = captureVideoRef.current
    if (video && video.readyState >= 2) {
      ctx.save()
      ctx.translate(vw / 2, vh / 2)
      ctx.scale(camera.zoom, camera.zoom)
      ctx.translate(-vw / 2 - camera.x, -vh / 2 - camera.y)
      if (settings.cornerRadius > 0) {
        clipRoundedRect(ctx, vw, vh, settings.cornerRadius)
      }
      ctx.drawImage(video, 0, 0, vw, vh)
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
