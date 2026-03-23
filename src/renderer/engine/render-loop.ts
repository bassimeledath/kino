import type { MutableRefObject, RefObject } from 'react'
import type { ProjectSettings, ZoomEvent } from '../../shared/types'
import type { SpringParams } from './spring-camera'
import { SpringCamera } from './spring-camera'
import type { ZoomState } from './zoom-controller'
import { ZoomController } from './zoom-controller'

// macOS-style arrow cursor as inline SVG data URL (black arrow with white border)
// Standard macOS cursor proportions at 2x (64x64 canvas, ~32x32 logical)
const MACOS_CURSOR_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g transform="translate(8, 4)">
    <path d="M0 0 L0 48 L12 36 L22 56 L30 52 L20 32 L36 32 Z"
          fill="white" stroke="white" stroke-width="4" stroke-linejoin="round"/>
    <path d="M0 0 L0 48 L12 36 L22 56 L30 52 L20 32 L36 32 Z"
          fill="black" stroke="black" stroke-width="1" stroke-linejoin="round"/>
  </g>
</svg>`)}`

// Cursor image singleton — loaded once, shared across render loops
let cursorImg: HTMLImageElement | null = null
let cursorImgLoaded = false

function ensureCursorImage(): HTMLImageElement {
  if (cursorImg) return cursorImg
  cursorImg = new Image()
  cursorImg.onload = () => { cursorImgLoaded = true }
  cursorImg.src = MACOS_CURSOR_SVG
  return cursorImg
}

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
  zoomEventsRef?: MutableRefObject<ZoomEvent[]>
  recordStartMs?: number
}

export function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
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

export function startRenderLoop(input: StartRenderLoopInput): () => void {
  const { canvas, captureVideoRef, camera, cursorNormRef, smoothCursorRef, ripplesRef, clickedRef, settings, zoomEventsRef, recordStartMs } = input
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  // Preload cursor image before first frame
  ensureCursorImage()

  const zoomController = new ZoomController()
  let prevCursor = { ...cursorNormRef.current }
  let lastFrameMs = performance.now()

  // Zoom event tracking
  let prevZoomState: ZoomState = 'IDLE'
  let currentZoomStartMs = 0

  // Cursor shake removal: track stable cursor position, ignore micro-jitter
  // Screen Studio uses removeCursorShakeThreshold: 500 (velocity-based, ~500px/s)
  // We convert to per-frame threshold: 500px/s ÷ 60fps ≈ 8.3px/frame
  let stableCursorX = cursorNormRef.current.x
  let stableCursorY = cursorNormRef.current.y

  // Cursor spring state (replaces Catmull-Rom — matches Screen Studio's mouseMovementSpring)
  let cursorSpringX = cursorNormRef.current.x
  let cursorSpringY = cursorNormRef.current.y
  let cursorSpringVx = 0
  let cursorSpringVy = 0

  // Cursor rotation state: subtle tilt based on horizontal velocity
  let cursorRotation = 0

  // Spring params (read from settings once, used per-frame)
  const positionSpring: SpringParams = {
    stiffness: settings.screenSpringStiffness,
    damping: settings.screenSpringDamping,
    mass: settings.screenSpringMass,
  }
  const zoomSpring: SpringParams = {
    stiffness: settings.zoomSpringStiffness,
    damping: settings.zoomSpringDamping,
    mass: settings.zoomSpringMass,
  }
  const zoomOutSpring: SpringParams = {
    stiffness: settings.zoomOutSpringStiffness,
    damping: settings.zoomOutSpringDamping,
    mass: settings.zoomOutSpringMass,
  }

  const intervalId = setInterval(() => {
    const now = performance.now()
    const dt = Math.min((now - lastFrameMs) / 1000, 0.1)
    lastFrameMs = now

    const vw = canvas.width
    const vh = canvas.height
    const pad = settings.padding
    const videoW = vw - 2 * pad
    const videoH = vh - 2 * pad

    // Cursor shake removal: only update stable position if movement exceeds velocity threshold
    // ~500px/s converted to per-frame distance at actual frame rate
    const shakeThresholdPx = dt > 0 ? 500 * dt : 8
    const rawDx = (cursorNormRef.current.x - stableCursorX) * vw
    const rawDy = (cursorNormRef.current.y - stableCursorY) * vh
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
    if (rawDist > shakeThresholdPx) {
      stableCursorX = cursorNormRef.current.x
      stableCursorY = cursorNormRef.current.y
    }

    // Cursor spring: smooth cursor position using mouseMovementSpring (470/70/3)
    // This replaces Catmull-Rom and matches Screen Studio's mouse following behavior
    let smoothX: number
    let smoothY: number

    if (settings.cursorSmoothing) {
      const ms = settings.mouseSpringStiffness
      const md = settings.mouseSpringDamping
      const mm = settings.mouseSpringMass

      const cax = (ms * (stableCursorX - cursorSpringX) - md * cursorSpringVx) / mm
      const cay = (ms * (stableCursorY - cursorSpringY) - md * cursorSpringVy) / mm
      cursorSpringVx += cax * dt
      cursorSpringVy += cay * dt
      cursorSpringX += cursorSpringVx * dt
      cursorSpringY += cursorSpringVy * dt

      smoothX = cursorSpringX
      smoothY = cursorSpringY
    } else {
      cursorSpringX = stableCursorX
      cursorSpringY = stableCursorY
      cursorSpringVx = 0
      cursorSpringVy = 0
      smoothX = stableCursorX
      smoothY = stableCursorY
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
      clicked,
    })

    // Track zoom events for timeline visualization
    if (zoomEventsRef) {
      const zoomState = zoomController.getState()
      const elapsedMs = recordStartMs ? Date.now() - recordStartMs : 0

      const isZooming = zoomState === 'CLICK_ZOOM_IN' || zoomState === 'CLICK_HOLD' ||
        zoomState === 'DWELL_ZOOM_IN' || zoomState === 'DWELL_HOLD'
      const wasZooming = prevZoomState === 'CLICK_ZOOM_IN' || prevZoomState === 'CLICK_HOLD' ||
        prevZoomState === 'DWELL_ZOOM_IN' || prevZoomState === 'DWELL_HOLD'

      if (isZooming && !wasZooming) {
        currentZoomStartMs = elapsedMs
      } else if (!isZooming && wasZooming) {
        const type = prevZoomState.startsWith('CLICK') ? 'click' : 'dwell'
        zoomEventsRef.current.push({
          startMs: currentZoomStartMs,
          endMs: elapsedMs,
          type: type as 'click' | 'dwell',
        })
      }
      prevZoomState = zoomState
    }

    // Camera target: only pan when zoomed in
    // Dead zone: don't reposition camera for small cursor movements within the
    // current viewport. Only pan when cursor approaches the edge of the visible
    // area (within 30% of viewport edge). This matches Screen Studio's stable
    // camera behavior — the camera stays put until the cursor forces it to move.
    const shouldPan = targetZoom > 1.05
    const rawTx = shouldPan ? (smoothX - 0.5) * videoW : 0
    const rawTy = shouldPan ? (smoothY - 0.5) * videoH : 0

    let tx: number
    let ty: number
    if (shouldPan) {
      const effectiveZoom = Math.max(camera.zoom, 1.01)
      // Half-size of the visible viewport in video coords
      const halfViewW = videoW / (2 * effectiveZoom)
      const halfViewH = videoH / (2 * effectiveZoom)
      // Cursor position in video-space relative to current camera center
      const cursorVideoX = (smoothX - 0.5) * videoW - camera.x
      const cursorVideoY = (smoothY - 0.5) * videoH - camera.y
      // Dead zone: 70% of the viewport half-size (pan only when cursor is in outer 30%)
      const deadZoneX = halfViewW * 0.7
      const deadZoneY = halfViewH * 0.7

      if (Math.abs(cursorVideoX) > deadZoneX || Math.abs(cursorVideoY) > deadZoneY) {
        // Cursor is near viewport edge — pan to re-center
        tx = rawTx
        ty = rawTy
      } else {
        // Cursor is within dead zone — keep camera where it is
        tx = camera.x
        ty = camera.y
      }
    } else {
      tx = 0
      ty = 0
    }

    // snapToEdgesRatio: clamp camera target so viewport stays within recording bounds
    // Screen Studio uses 0.25 — keeps 25% margin from edges, preventing "cursor going far left"
    if (shouldPan && settings.snapToEdgesRatio > 0) {
      const effectiveZoom = Math.max(targetZoom, camera.zoom)
      const maxPanX = videoW / 2 * (1 - 1 / effectiveZoom) * (1 - settings.snapToEdgesRatio)
      const maxPanY = videoH / 2 * (1 - 1 / effectiveZoom) * (1 - settings.snapToEdgesRatio)
      tx = Math.max(-maxPanX, Math.min(maxPanX, tx))
      ty = Math.max(-maxPanY, Math.min(maxPanY, ty))
    }

    // Update camera with separate springs for position (screen) and zoom (click)
    camera.update(tx, ty, targetZoom, dt, positionSpring, zoomSpring, zoomOutSpring)

    ctx.fillStyle = settings.backgroundColor
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

    // Subtle cursor rotation based on horizontal cursor spring velocity
    const hVel = cursorSpringVx * vw
    const targetRotation = Math.max(-0.25, Math.min(0.25, hVel * 0.0004))
    cursorRotation += (targetRotation - cursorRotation) * Math.min(1, 8 * dt)

    if (settings.cursorType === 'macos' && cursorImgLoaded && cursorImg) {
      // Draw macOS arrow cursor with hotspot at top-left
      // SVG is 64x64 at 2x, so logical size is 32x32. Scale by cursorSize.
      const cursorW = 32 * settings.cursorSize
      const cursorH = 32 * settings.cursorSize
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(cursorRotation)
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 2
      ctx.drawImage(cursorImg, 0, 0, cursorW, cursorH)
      ctx.restore()
    } else {
      // Fallback: white circle while image loads or for non-macos cursor types
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, 7 * settings.cursorSize, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.93)'
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 7
      ctx.fill()
      ctx.restore()
    }

  }, 16)

  return () => {
    clearInterval(intervalId)
  }
}
