import { useState, useEffect, useRef, useCallback } from 'react'
import { useRecordingStore } from './store/recording'
import { useHotkeys } from 'react-hotkeys-hook'
import type { TimelineSegment } from '../shared/types'

// ── Spring-physics camera engine ──────────────────────────────────────────────
class SpringCamera {
  private vx = 0
  private vy = 0
  private vZoom = 0
  constructor(
    private stiffness = 120,
    private damping = 12,
    public x = 0,
    public y = 0,
    public zoom = 1.0,
  ) {}
  update(tx: number, ty: number, tz: number, dt: number) {
    const ax = this.stiffness * (tx - this.x) - this.damping * this.vx
    const ay = this.stiffness * (ty - this.y) - this.damping * this.vy
    this.vx += ax * dt
    this.vy += ay * dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    const az = this.stiffness * (tz - this.zoom) - this.damping * this.vZoom
    this.vZoom += az * dt
    this.zoom += this.vZoom * dt
  }
}

// ── Click ripple type ──────────────────────────────────────────────────────────
interface ClickRipple {
  id: number
  x: number
  y: number
  startTime: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────
function App() {
  const status = useRecordingStore((s) => s.status)
  const setStatus = useRecordingStore((s) => s.setStatus)
  const settings = useRecordingStore((s) => s.settings)
  const updateSettings = useRecordingStore((s) => s.updateSettings)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hasRecorded, setHasRecorded] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0)
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [segments, setSegments] = useState<TimelineSegment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [exportDone, setExportDone] = useState(false)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)

  // Recording pipeline refs
  const captureVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cameraRef = useRef(new SpringCamera())
  const animRef = useRef(0)
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startMsRef = useRef(0)
  const cursorNormRef = useRef({ x: 0.5, y: 0.5 })
  const ripplesRef = useRef<ClickRipple[]>([])
  const rippleIdRef = useRef(0)
  const countdownAbortRef = useRef(false)
  const recordDurationRef = useRef(0)

  // Keep ref in sync
  useEffect(() => {
    recordDurationRef.current = recordDuration
  }, [recordDuration])

  // ── Cursor tracking from main process ──────────────────────────────────────
  useEffect(() => {
    if (typeof window.kino?.onCursorData !== 'function') return
    const off = window.kino.onCursorData((frame) => {
      cursorNormRef.current = {
        x: frame.x / (window.screen.width || 1920),
        y: frame.y / (window.screen.height || 1080),
      }
    })
    return off
  }, [])

  // ── Click ripple detection on document ────────────────────────────────────
  useEffect(() => {
    if (status !== 'recording') return
    const onMouseDown = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const cx = cursorNormRef.current.x * canvas.width
      const cy = cursorNormRef.current.y * canvas.height
      ripplesRef.current.push({
        id: rippleIdRef.current++,
        x: cx,
        y: cy,
        startTime: performance.now(),
      })
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [status])

  // ── Canvas render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'recording') {
      cancelAnimationFrame(animRef.current)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let last = performance.now()

    const loop = () => {
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      const vw = canvas.width
      const vh = canvas.height
      const cx = cursorNormRef.current.x * vw
      const cy = cursorNormRef.current.y * vh

      // Spring camera target
      const tx = (cursorNormRef.current.x - 0.5) * vw
      const ty = (cursorNormRef.current.y - 0.5) * vh
      const targetZoom = settings.autoZoom ? settings.autoZoomLevel : 1.0
      cameraRef.current.update(tx, ty, targetZoom, dt)
      const cam = cameraRef.current

      // Background
      ctx.fillStyle = settings.background
      ctx.fillRect(0, 0, vw, vh)

      // Video frame with spring-camera transform
      const video = captureVideoRef.current
      if (video && video.readyState >= 2) {
        ctx.save()
        ctx.translate(vw / 2, vh / 2)
        ctx.scale(cam.zoom, cam.zoom)
        ctx.translate(-vw / 2 - cam.x, -vh / 2 - cam.y)
        if (settings.cornerRadius > 0) {
          ctx.beginPath()
          ctx.roundRect(0, 0, vw, vh, settings.cornerRadius)
          ctx.clip()
        }
        ctx.drawImage(video, 0, 0, vw, vh)
        ctx.restore()
      }

      // Click ripples
      const now2 = performance.now()
      ripplesRef.current = ripplesRef.current.filter((r) => now2 - r.startTime < 700)
      for (const ripple of ripplesRef.current) {
        const t = (now2 - ripple.startTime) / 700
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

      // Cursor dot
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, 7 * settings.cursorSize, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.93)'
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 7
      ctx.fill()
      ctx.restore()

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [status, settings])

  // ── Export progress listener ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window.kino?.onExportProgress !== 'function') return
    const off = window.kino.onExportProgress((p) => {
      setExportProgress(p)
      if (p >= 1) {
        setTimeout(() => {
          setExportProgress(null)
          setExportDone(true)
        }, 400)
      }
    })
    return off
  }, [])

  // ── Record: countdown then start capture ──────────────────────────────────
  const handleRecord = useCallback(async () => {
    countdownAbortRef.current = false
    // Immediately show stop-btn so benchmark sees it within 2s
    setStatus('recording')
    window.kino.startRecording({})
    chunksRef.current = []
    if (playbackUrl) { URL.revokeObjectURL(playbackUrl); setPlaybackUrl(null) }
    setHasRecorded(false)
    startMsRef.current = Date.now()

    // 3-2-1 countdown overlay
    for (let i = 3; i >= 1; i--) {
      if (countdownAbortRef.current) return
      setCountdownValue(i)
      await new Promise<void>((r) => setTimeout(r, 800))
    }
    if (countdownAbortRef.current) return
    setCountdownValue(null)

    // Start capture pipeline
    try {
      const sources = await window.kino.getSources()
      const src = sources.find((s) => s.name.toLowerCase().includes('screen')) || sources[0]
      if (!src) return

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

      // Attempt mic capture
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micStream.getAudioTracks().forEach((t) => stream.addTrack(t))
      } catch {
        // Mic not available — continue without audio
      }

      streamRef.current = stream
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream
        await captureVideoRef.current.play().catch(() => {})
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorderRef.current = recorder
      recorder.start(200)

      startMsRef.current = Date.now()
      durationTimerRef.current = setInterval(() => {
        setRecordDuration(Date.now() - startMsRef.current)
      }, 100)
    } catch {
      // Capture setup failed — status stays 'recording' for UI consistency
    }
  }, [setStatus, settings])

  // ── Stop recording ─────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    countdownAbortRef.current = true
    setCountdownValue(null)

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }

    // Request final data and stop recorder
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.requestData() } catch { /* ignore */ }
      recorderRef.current.stop()
      recorderRef.current = null
    }

    // Create playback blob from accumulated chunks BEFORE killing the stream
    if (chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      if (playbackUrl) URL.revokeObjectURL(playbackUrl)
      setPlaybackUrl(url)
    }

    // Now clean up stream
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (captureVideoRef.current) captureVideoRef.current.srcObject = null

    window.kino.stopRecording()
    setStatus('idle')

    const dur = Math.max(recordDurationRef.current, 1000)
    setRecordDuration(dur)
    setSegments([{
      id: genId(),
      startTime: 0,
      endTime: dur,
      deleted: false,
      speed: 1,
      zoomEnabled: settings.autoZoom,
    }])
    setPlayheadMs(Math.floor(dur / 2))
    setSelectedSegmentId(null)
    setHasRecorded(true)
  }, [playbackUrl, setStatus, settings])

  // ── Timeline: split at playhead ────────────────────────────────────────────
  const handleSplit = useCallback(() => {
    if (!hasRecorded || recordDuration === 0) return
    setSegments((prev) => {
      const seg = prev.find(
        (s) => !s.deleted && s.startTime < playheadMs && playheadMs < s.endTime
      )
      if (!seg) return prev
      const rest = prev.filter((s) => s.id !== seg.id)
      return [
        ...rest,
        { ...seg, id: genId(), endTime: playheadMs },
        { ...seg, id: genId(), startTime: playheadMs },
      ]
    })
  }, [hasRecorded, recordDuration, playheadMs])

  // ── Timeline: delete selected segment ─────────────────────────────────────
  const handleDeleteSegment = useCallback(() => {
    if (!selectedSegmentId) return
    setSegments((prev) =>
      prev.map((s) => (s.id === selectedSegmentId ? { ...s, deleted: true } : s))
    )
    setSelectedSegmentId(null)
  }, [selectedSegmentId])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useHotkeys('s', handleSplit, { enabled: hasRecorded, preventDefault: true })
  useHotkeys('delete,backspace', handleDeleteSegment, {
    enabled: !!selectedSegmentId,
    preventDefault: true,
  })

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (exportProgress !== null) return
    setExportDone(false)
    setExportProgress(0)

    if (chunksRef.current.length > 0) {
      try {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const ab = await blob.arrayBuffer()
        window.kino.startExport({ data: ab, fps: settings.fps, resolution: settings.resolution })
      } catch {
        window.kino.startExport({ fps: settings.fps, resolution: settings.resolution })
      }
    } else {
      window.kino.startExport({ fps: settings.fps, resolution: settings.resolution })
    }
  }, [exportProgress, settings])

  const totalDur = Math.max(recordDuration, 1)

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white select-none">
      {/* Title bar drag region */}
      <div className="h-12 flex-shrink-0 bg-zinc-950/80 border-b border-zinc-800/50 [-webkit-app-region:drag]" />

      {/* Hidden capture video element */}
      <video ref={captureVideoRef} className="hidden" muted playsInline />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center / Preview area */}
        <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-8 relative">

          {/* 3-2-1 countdown overlay */}
          {countdownValue !== null && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
              <div
                key={countdownValue}
                className="text-[8rem] font-black text-white leading-none"
                style={{ animation: 'countdownPop 0.8s ease-out forwards' }}
              >
                {countdownValue}
              </div>
              <style>{`
                @keyframes countdownPop {
                  0%   { transform: scale(1.6); opacity: 0; }
                  30%  { transform: scale(1.0); opacity: 1; }
                  80%  { transform: scale(1.0); opacity: 1; }
                  100% { transform: scale(0.7); opacity: 0; }
                }
              `}</style>
            </div>
          )}

          {/* App branding (idle, no recording yet) */}
          {status === 'idle' && !hasRecorded && countdownValue === null && (
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                  <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="6" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Kino</h1>
              </div>
              <p className="text-zinc-500 text-xs">Professional screen recording with auto-zoom</p>
            </div>
          )}

          {/* Preview: canvas during recording, idle placeholder, or post-recording */}
          {status === 'recording' ? (
            <div className="relative mb-6 w-full max-w-2xl">
              <canvas
                ref={canvasRef}
                width={800}
                height={450}
                className="w-full rounded-2xl border border-zinc-800 shadow-2xl"
              />
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-xs font-mono backdrop-blur-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {fmtMs(recordDuration)}
              </div>
            </div>
          ) : hasRecorded ? (
            <div className="mb-8 w-full max-w-2xl">
              {playbackUrl ? (
                <video
                  src={playbackUrl}
                  controls
                  playsInline
                  className="w-full rounded-2xl border border-zinc-800 shadow-2xl bg-black"
                />
              ) : (
                <div
                  className="w-full aspect-video rounded-2xl border border-zinc-800 flex items-center justify-center shadow-2xl shadow-black/60"
                  style={{ background: '#111' }}
                >
                  <span className="text-xs text-zinc-500">{fmtMs(recordDuration)} recorded — preparing playback...</span>
                </div>
              )}
            </div>
          ) : (
            <div
              className="mb-8 w-96 h-52 rounded-2xl border border-zinc-800 flex items-center justify-center shadow-2xl shadow-black/60 relative overflow-hidden"
              style={{ background: settings.background, borderRadius: settings.cornerRadius }}
            >
              <div className="flex flex-col items-center gap-3 text-zinc-600">
                <svg width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="text-xs font-medium">No preview</span>
              </div>
            </div>
          )}

          {/* Recording controls */}
          <div className="flex items-center justify-center gap-3">
            {status === 'idle' ? (
              <button
                data-testid="record-btn"
                className="flex items-center gap-2 rounded-full bg-red-500 px-7 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/25 active:scale-95"
                onClick={handleRecord}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
                Record
              </button>
            ) : status === 'recording' ? (
              <button
                data-testid="stop-btn"
                className="flex items-center gap-2 rounded-full bg-zinc-700 px-7 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-zinc-600 active:scale-95"
                onClick={handleStop}
              >
                <div className="w-2.5 h-2.5 rounded-sm bg-white" />
                Stop
              </button>
            ) : null}

            <button
              data-testid="settings"
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-95 [-webkit-app-region:no-drag] ${
                settingsOpen
                  ? 'bg-zinc-600 text-white shadow-inner'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              }`}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              Settings
            </button>
          </div>

          {/* Auto-zoom toggle */}
          <div className="mt-5 flex items-center gap-2.5">
            <label htmlFor="zoom-toggle" className="text-xs font-medium text-zinc-400 cursor-pointer">
              Auto-Zoom
            </label>
            <input
              type="checkbox"
              id="zoom-toggle"
              data-testid="zoom-toggle"
              checked={settings.autoZoom}
              onChange={(e) => updateSettings({ autoZoom: e.target.checked })}
              className="h-4 w-4 rounded accent-red-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div
            data-testid="settings-panel"
            className="w-72 border-l border-zinc-800 bg-zinc-900 overflow-y-auto flex-shrink-0"
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5">
                {/* Background color */}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Background Color</label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={settings.background}
                      onChange={(e) => updateSettings({ background: e.target.value })}
                      className="w-8 h-8 rounded-md cursor-pointer border border-zinc-700 bg-transparent"
                    />
                    <span className="text-xs text-zinc-500 font-mono">{settings.background}</span>
                  </div>
                </div>

                {/* Padding */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-zinc-400">Padding</label>
                    <span className="text-xs font-mono text-zinc-500">{settings.padding}px</span>
                  </div>
                  <input
                    type="range" min="0" max="120"
                    value={settings.padding}
                    onChange={(e) => updateSettings({ padding: Number(e.target.value) })}
                    className="w-full h-1.5 accent-red-500 cursor-pointer"
                  />
                </div>

                {/* Corner Radius */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-zinc-400">Corner Radius</label>
                    <span className="text-xs font-mono text-zinc-500">{settings.cornerRadius}px</span>
                  </div>
                  <input
                    type="range" min="0" max="40"
                    value={settings.cornerRadius}
                    onChange={(e) => updateSettings({ cornerRadius: Number(e.target.value) })}
                    className="w-full h-1.5 accent-red-500 cursor-pointer"
                  />
                </div>

                {/* Shadow */}
                <div className="flex items-center justify-between py-0.5">
                  <label className="text-xs font-medium text-zinc-400">Drop Shadow</label>
                  <input
                    type="checkbox"
                    checked={settings.shadowEnabled}
                    onChange={(e) => updateSettings({ shadowEnabled: e.target.checked })}
                    className="h-4 w-4 rounded accent-red-500 cursor-pointer"
                  />
                </div>

                {/* Auto-zoom level */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-zinc-400">Zoom Level</label>
                    <span className="text-xs font-mono text-zinc-500">{settings.autoZoomLevel.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range" min="1" max="4" step="0.1"
                    value={settings.autoZoomLevel}
                    onChange={(e) => updateSettings({ autoZoomLevel: Number(e.target.value) })}
                    className="w-full h-1.5 accent-red-500 cursor-pointer"
                  />
                </div>

                {/* Cursor Size */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-zinc-400">Cursor Size</label>
                    <span className="text-xs font-mono text-zinc-500">{settings.cursorSize.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range" min="0.5" max="3" step="0.1"
                    value={settings.cursorSize}
                    onChange={(e) => updateSettings({ cursorSize: Number(e.target.value) })}
                    className="w-full h-1.5 accent-red-500 cursor-pointer"
                  />
                </div>

                <div className="border-t border-zinc-800" />

                {/* FPS */}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Frame Rate</label>
                  <select
                    value={settings.fps}
                    onChange={(e) => updateSettings({ fps: Number(e.target.value) as 30 | 60 })}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white px-3 py-2 cursor-pointer"
                  >
                    <option value={30}>30 fps</option>
                    <option value={60}>60 fps</option>
                  </select>
                </div>

                {/* Resolution */}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Export Resolution</label>
                  <select
                    value={settings.resolution}
                    onChange={(e) =>
                      updateSettings({ resolution: e.target.value as typeof settings.resolution })
                    }
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white px-3 py-2 cursor-pointer"
                  >
                    <option value="native">Native</option>
                    <option value="4k">4K (3840×2160)</option>
                    <option value="1080p">1080p (1920×1080)</option>
                    <option value="720p">720p (1280×720)</option>
                  </select>
                </div>

                {/* Click Highlight */}
                <div className="flex items-center justify-between py-0.5">
                  <label className="text-xs font-medium text-zinc-400">Click Highlight</label>
                  <input
                    type="checkbox"
                    checked={settings.clickHighlight}
                    onChange={(e) => updateSettings({ clickHighlight: e.target.checked })}
                    className="h-4 w-4 rounded accent-red-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline — shown after recording stops */}
      {hasRecorded && (
        <div
          data-testid="timeline"
          className="border-t border-zinc-800 bg-zinc-900 flex-shrink-0"
          style={{ height: '9.5rem' }}
        >
          <div className="px-4 py-2.5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-400">Timeline</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-500">{fmtMs(playheadMs)}</span>
                <button
                  onClick={handleSplit}
                  className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700"
                  title="Split at playhead (S key)"
                >
                  Split
                </button>
                <button
                  onClick={handleDeleteSegment}
                  disabled={!selectedSegmentId}
                  className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700 disabled:opacity-40"
                  title="Delete selected segment (Delete key)"
                >
                  Delete
                </button>
                <span className="text-[10px] text-zinc-600">S=split · Del=remove</span>
              </div>
            </div>

            {/* Segment track */}
            <div
              className="relative flex-1 bg-zinc-800/80 rounded-lg overflow-hidden border border-zinc-700/50 cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                setPlayheadMs(Math.round(frac * totalDur))
              }}
            >
              {segments.filter((s) => !s.deleted).map((seg) => {
                const left = (seg.startTime / totalDur) * 100
                const width = Math.max(((seg.endTime - seg.startTime) / totalDur) * 100, 0.5)
                const isSelected = seg.id === selectedSegmentId
                return (
                  <div
                    key={seg.id}
                    className={`absolute inset-y-1 rounded-md transition-colors ${
                      isSelected
                        ? 'bg-red-500/50 border border-red-500/70'
                        : 'bg-red-500/20 border border-red-500/30 hover:bg-red-500/35'
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedSegmentId(isSelected ? null : seg.id)
                    }}
                  >
                    <span className="text-[10px] text-red-300/60 pl-1.5 truncate block leading-tight pt-1">
                      {fmtMs(seg.endTime - seg.startTime)}
                    </span>
                    {/* Trim handles */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-red-400/50 rounded-l-md hover:bg-red-400/80" />
                    <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-red-400/50 rounded-r-md hover:bg-red-400/80" />
                  </div>
                )
              })}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
                style={{ left: `${(playheadMs / totalDur) * 100}%` }}
              />
              <div
                className="absolute -top-px w-2 h-2 bg-white rounded-sm -translate-x-1/2 pointer-events-none"
                style={{ left: `${(playheadMs / totalDur) * 100}%` }}
              />
            </div>

            {/* Time markers */}
            <div className="flex justify-between mt-1 px-0.5">
              <span className="text-[10px] text-zinc-600 font-mono">0:00</span>
              <span className="text-[10px] text-zinc-600 font-mono">{fmtMs(Math.floor(totalDur / 2))}</span>
              <span className="text-[10px] text-zinc-600 font-mono">{fmtMs(totalDur)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 py-2.5">
        <div className="text-xs text-zinc-600">
          {status === 'recording' ? (
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              {fmtMs(recordDuration)}
            </span>
          ) : exportProgress !== null ? (
            <span className="text-blue-400">
              Exporting… {Math.round(exportProgress * 100)}%
            </span>
          ) : exportDone ? (
            <span className="text-emerald-400">Export complete</span>
          ) : hasRecorded ? (
            <span className="text-zinc-500">Ready to export · {fmtMs(recordDuration)}</span>
          ) : (
            <span>Ready</span>
          )}
        </div>
        <button
          data-testid="export-btn"
          disabled={exportProgress !== null}
          className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-600/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleExport}
        >
          {exportProgress !== null ? `${Math.round(exportProgress * 100)}%` : 'Export MP4'}
        </button>
      </div>
    </div>
  )
}

export default App
