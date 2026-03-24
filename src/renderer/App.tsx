import { useCallback, useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import type { TimelineSegment, ZoomEvent } from '../shared/types'
import type { RecordingMetadata } from './hooks/useRecording'
import { FloatingToolbar } from './components/FloatingToolbar'
import { SettingsPanel } from './components/SettingsPanel'
import { Timeline } from './components/Timeline'
import { VideoPreview } from './components/VideoPreview'
import type { ClickRipple } from './engine/render-loop'
import { startRenderLoop } from './engine/render-loop'
import { SpringCamera } from './engine/spring-camera'
import { usePlayback } from './hooks/usePlayback'
import { useRecording } from './hooks/useRecording'
import { useRecordingStore } from './store/recording'
import { fmtFileSize, fmtMs } from './utils/format'

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function App() {
  const status = useRecordingStore((s) => s.status)
  const setStatus = useRecordingStore((s) => s.setStatus)
  const settings = useRecordingStore((s) => s.settings)
  const updateSettings = useRecordingStore((s) => s.updateSettings)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hasRecorded, setHasRecorded] = useState(false)
  const [segments, setSegments] = useState<TimelineSegment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [exportDone, setExportDone] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [ghostMs, setGhostMs] = useState<number | null>(null)
  const [zoomEvents, setZoomEvents] = useState<ZoomEvent[]>([])
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null)
  const [recordingMetadata, setRecordingMetadata] = useState<RecordingMetadata | null>(null)
  const [durationOverride, setDurationOverride] = useState<number | null>(null)
  const toolbarChunksRef = useRef<Blob[] | null>(null)

  const { playbackUrl, clearPlayback, setPlaybackFromChunks } = usePlayback()
  const {
    captureVideoRef,
    canvasRef,
    countdownValue,
    recordDuration,
    startRecording,
    stopRecording,
    getChunks,
    zoomEventsRef,
    startMsRef,
  } = useRecording({ settings, setStatus })

  const effectiveDuration = durationOverride ?? recordDuration

  // Set body background for editor (toolbar keeps transparent)
  useEffect(() => {
    document.body.style.background = '#0a0a0a'
  }, [])

  // Load toolbar recording data on mount (when editor opens after toolbar recording)
  useEffect(() => {
    if (typeof window.kino?.getToolbarRecording !== 'function') return
    let cancelled = false

    window.kino.getToolbarRecording().then((data) => {
      if (cancelled || !data) return

      const blob = new Blob([data.data], { type: 'video/webm' })
      toolbarChunksRef.current = [blob]
      setPlaybackFromChunks([blob])
      setDurationOverride(data.duration)
      setHasRecorded(true)
      setSegments([{
        id: genId(),
        startTime: 0,
        endTime: data.duration,
        deleted: false,
        speed: 1,
        zoomEnabled: settings.autoZoom,
      }])
      setZoomEvents(data.zoomEvents as ZoomEvent[])
      setRecordingMetadata(data.metadata as RecordingMetadata)
    })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cameraRef = useRef(new SpringCamera())
  const cursorNormRef = useRef({ x: 0.5, y: 0.5 })
  const smoothCursorRef = useRef({ x: 0.5, y: 0.5 })
  const ripplesRef = useRef<ClickRipple[]>([])
  const rippleIdRef = useRef(0)
  const prevClickRef = useRef(false)
  const clickedRef = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    if (typeof window.kino?.onCursorData !== 'function') return
    const off = window.kino.onCursorData((frame) => {
      cursorNormRef.current = {
        x: frame.x / (window.screen.width || 1920),
        y: frame.y / (window.screen.height || 1080),
      }

      // Detect mousedown transition from main process global click tracking
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

    return () => {
      stopLoop()
    }
  }, [captureVideoRef, canvasRef, settings, status])

  useEffect(() => {
    if (typeof window.kino?.onExportProgress !== 'function') return
    const off = window.kino.onExportProgress((progress) => {
      setExportProgress(progress)
    })
    return off
  }, [])

  useEffect(() => {
    if (typeof window.kino?.onExportDone !== 'function') return
    const off = window.kino.onExportDone((result) => {
      setExportProgress(null)
      if (result.error) {
        setExportDone(false)
        setExportError(result.error)
        return
      }
      setExportError(null)
      setExportDone(!!result.path)
    })
    return off
  }, [])

  const handleRecord = useCallback(async () => {
    clearPlayback()
    setHasRecorded(false)
    setSegments([])
    setSelectedSegmentId(null)
    setPlayheadMs(0)
    setExportDone(false)
    setExportError(null)
    setExportProgress(null)
    setZoomEvents([])
    setRecordingMetadata(null)
    setDurationOverride(null)
    toolbarChunksRef.current = null

    await startRecording()
  }, [clearPlayback, startRecording])

  const handleStop = useCallback(async () => {
    const result = await stopRecording()
    setPlaybackFromChunks(result.chunks)

    setSegments([
      {
        id: genId(),
        startTime: 0,
        endTime: result.duration,
        deleted: false,
        speed: 1,
        zoomEnabled: settings.autoZoom,
      },
    ])
    setPlayheadMs(0)
    setSelectedSegmentId(null)
    setHasRecorded(true)
    setZoomEvents(result.zoomEvents)
    setRecordingMetadata(result.metadata)
  }, [setPlaybackFromChunks, settings.autoZoom, stopRecording])

  const handleSplit = useCallback(() => {
    if (!hasRecorded || effectiveDuration === 0) return

    setSegments((prev) => {
      const seg = prev.find(
        (segment) =>
          !segment.deleted &&
          segment.startTime < playheadMs &&
          playheadMs < segment.endTime,
      )
      if (!seg) return prev

      const rest = prev.filter((segment) => segment.id !== seg.id)
      return [
        ...rest,
        { ...seg, id: genId(), endTime: playheadMs },
        { ...seg, id: genId(), startTime: playheadMs },
      ]
    })
  }, [hasRecorded, playheadMs, effectiveDuration])

  const handleDeleteSegment = useCallback(() => {
    if (!selectedSegmentId) return
    setSegments((prev) =>
      prev.map((segment) =>
        segment.id === selectedSegmentId ? { ...segment, deleted: true } : segment,
      ),
    )
    setSelectedSegmentId(null)
  }, [selectedSegmentId])

  useHotkeys('s', handleSplit, { enabled: hasRecorded, preventDefault: true })
  useHotkeys(
    'delete,backspace',
    () => {
      if (selectedZoomId) {
        handleRemoveZoomRange(selectedZoomId)
      } else if (selectedSegmentId) {
        handleDeleteSegment()
      }
    },
    {
      enabled: !!selectedSegmentId || !!selectedZoomId,
      preventDefault: true,
    },
  )

  const handleUpdateSegment = useCallback(
    (id: string, updates: Partial<TimelineSegment>) => {
      setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
    },
    [],
  )

  const handleAddZoomRange = useCallback(
    (startMs: number) => {
      const duration = 2000
      const endMs = Math.min(startMs + duration, effectiveDuration)
      const newZoom: ZoomEvent = {
        id: genId(),
        startMs,
        endMs,
        type: 'manual',
        zoomLevel: settings.autoZoomLevel,
      }
      setZoomEvents((prev) => [...prev, newZoom].sort((a, b) => a.startMs - b.startMs))
      setSelectedZoomId(newZoom.id)
    },
    [effectiveDuration, settings.autoZoomLevel],
  )

  const handleRemoveZoomRange = useCallback(
    (id: string) => {
      setZoomEvents((prev) => prev.filter((e) => e.id !== id))
      if (selectedZoomId === id) setSelectedZoomId(null)
    },
    [selectedZoomId],
  )

  const handleUpdateZoomRange = useCallback(
    (id: string, updates: Partial<ZoomEvent>) => {
      setZoomEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      )
    },
    [],
  )

  const handleExport = useCallback(async () => {
    if (exportProgress !== null) return

    setExportDone(false)
    setExportError(null)
    setExportProgress(0)

    const chunks = toolbarChunksRef.current ?? getChunks()
    if (chunks.length === 0) {
      setExportProgress(null)
      setExportError('No recording data available to export.')
      return
    }

    try {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const ab = await blob.arrayBuffer()
      await window.kino.startExport({ data: ab, fps: settings.fps, resolution: settings.resolution })
    } catch (error) {
      console.error('[export] failed to start', error)
      setExportProgress(null)
      setExportDone(false)
      setExportError('Failed to send recording data to export pipeline.')
    }
  }, [exportProgress, getChunks, settings.fps, settings.resolution])

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white select-none">
      <div className="h-12 flex-shrink-0 bg-zinc-950/80 border-b border-zinc-800/50 [-webkit-app-region:drag]" />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-8 relative">
          <VideoPreview
            status={status}
            hasRecorded={hasRecorded}
            countdownValue={countdownValue}
            recordDuration={status === 'recording' ? recordDuration : effectiveDuration}
            settings={settings}
            playbackUrl={playbackUrl}
            captureVideoRef={captureVideoRef}
            canvasRef={canvasRef}
            segments={segments}
            playheadMs={playheadMs}
            onPlayheadChange={setPlayheadMs}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
            ghostMs={ghostMs}
          />

          <div className="flex items-center justify-center gap-2.5">
            {status === 'idle' && !hasRecorded ? (
              <button
                data-testid="record-btn"
                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-2 text-[13px] font-semibold text-white transition-all duration-150 hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/20 active:scale-[0.97]"
                onClick={handleRecord}
              >
                <div className="w-2 h-2 rounded-full bg-white" />
                Record
              </button>
            ) : status === 'idle' && hasRecorded ? (
              <>
                <button
                  data-testid="play-btn"
                  className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-2 text-[13px] font-semibold text-white transition-all duration-150 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.97]"
                  onClick={() => setIsPlaying((p) => !p)}
                >
                  {isPlaying ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="white">
                        <rect x="1" y="1" width="3.5" height="10" rx="0.5" />
                        <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="white">
                        <polygon points="2,0 12,6 2,12" />
                      </svg>
                      Play
                    </>
                  )}
                </button>
                <button
                  data-testid="record-btn"
                  className="flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2 text-[13px] font-medium text-zinc-400 transition-all duration-150 hover:bg-zinc-700 hover:text-zinc-200 active:scale-[0.97]"
                  onClick={handleRecord}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Re-record
                </button>
              </>
            ) : status === 'recording' ? (
              <button
                data-testid="stop-btn"
                className="flex items-center gap-2 rounded-full bg-zinc-700 px-6 py-2 text-[13px] font-semibold text-white transition-all duration-150 hover:bg-zinc-600 active:scale-[0.97]"
                onClick={handleStop}
              >
                <div className="w-2 h-2 rounded-sm bg-white" />
                Stop
              </button>
            ) : null}

            <button
              data-testid="settings"
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.97] [-webkit-app-region:no-drag] ${
                settingsOpen
                  ? 'bg-zinc-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="inline-block mr-1.5 -mt-px">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2.5">
            <label htmlFor="zoom-toggle" className="text-[11px] font-medium text-zinc-500 cursor-pointer">
              Auto-Zoom
            </label>
            <button
              id="zoom-toggle"
              data-testid="zoom-toggle"
              role="switch"
              aria-checked={settings.autoZoom}
              onClick={() => updateSettings({ autoZoom: !settings.autoZoom })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                settings.autoZoom ? 'bg-red-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  settings.autoZoom ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
        </div>

        <SettingsPanel
          settingsOpen={settingsOpen}
          settings={settings}
          updateSettings={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      </div>

      <Timeline
        hasRecorded={hasRecorded}
        recordDuration={effectiveDuration}
        playheadMs={playheadMs}
        ghostMs={ghostMs}
        selectedSegmentId={selectedSegmentId}
        selectedZoomId={selectedZoomId}
        segments={segments}
        zoomEvents={zoomEvents}
        isPlaying={isPlaying}
        autoZoomLevel={settings.autoZoomLevel}
        dwellZoomLevel={settings.dwellZoomLevel}
        onSetPlayheadMs={setPlayheadMs}
        onGhostMsChange={setGhostMs}
        onToggleSegmentSelected={(id) =>
          setSelectedSegmentId((prev) => (prev === id ? null : id))
        }
        onSplit={handleSplit}
        onDeleteSegment={handleDeleteSegment}
        onUpdateSegment={handleUpdateSegment}
        onPlayingChange={setIsPlaying}
        onSelectZoom={(id) => setSelectedZoomId((prev) => (prev === id ? null : id))}
        onAddZoomRange={handleAddZoomRange}
        onRemoveZoomRange={handleRemoveZoomRange}
        onUpdateZoomRange={handleUpdateZoomRange}
      />

      <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-950 px-4 py-2">
        <div className="flex items-center gap-4 text-[11px] text-zinc-600">
          {status === 'recording' ? (
            <span className="flex items-center gap-1.5 text-red-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              REC {fmtMs(recordDuration)}
            </span>
          ) : exportError ? (
            <span className="text-rose-400">{exportError}</span>
          ) : exportProgress !== null ? (
            <span className="flex items-center gap-2 text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              Exporting… {Math.round(exportProgress * 100)}%
            </span>
          ) : exportDone ? (
            <span className="text-emerald-400 font-medium">Export complete</span>
          ) : hasRecorded ? (
            <span className="text-zinc-500 font-medium">{fmtMs(recordDuration)}</span>
          ) : (
            <span>Ready</span>
          )}

          {recordingMetadata && hasRecorded && (
            <>
              <span className="w-px h-3 bg-zinc-800" />
              <span className="font-mono text-zinc-600">{recordingMetadata.screenWidth}×{recordingMetadata.screenHeight}</span>
              <span className="font-mono text-zinc-600">{settings.fps}fps</span>
              <span className="font-mono text-zinc-600">{fmtFileSize(recordingMetadata.fileSize)}</span>
              <span className="font-mono text-zinc-700">{recordingMetadata.codec.replace('video/', '')}</span>
            </>
          )}

          {zoomEvents.length > 0 && hasRecorded && (
            <>
              <span className="w-px h-3 bg-zinc-800" />
              <span className="text-cyan-600">{zoomEvents.filter(e => e.type === 'click').length} click zooms</span>
              <span className="text-violet-600">{zoomEvents.filter(e => e.type === 'dwell').length} dwell zooms</span>
              {zoomEvents.some(e => e.type === 'manual') && (
                <span className="text-teal-600">{zoomEvents.filter(e => e.type === 'manual').length} manual zooms</span>
              )}
            </>
          )}
        </div>
        <button
          data-testid="export-btn"
          disabled={exportProgress !== null}
          className="rounded-lg bg-blue-600 px-5 py-1.5 text-[11px] font-semibold text-white transition-all duration-150 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-600/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleExport}
        >
          {exportProgress !== null ? `${Math.round(exportProgress * 100)}%` : 'Export MP4'}
        </button>
      </div>
    </div>
  )
}

function Root() {
  const isToolbar = window.location.hash === '#/toolbar'
  if (isToolbar) {
    return <FloatingToolbar />
  }
  return <App />
}

export default Root
