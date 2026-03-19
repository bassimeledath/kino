import { useCallback, useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import type { TimelineSegment } from '../shared/types'
import { SettingsPanel } from './components/SettingsPanel'
import { Timeline } from './components/Timeline'
import { VideoPreview } from './components/VideoPreview'
import type { ClickRipple } from './engine/render-loop'
import { startRenderLoop } from './engine/render-loop'
import { SpringCamera } from './engine/spring-camera'
import { usePlayback } from './hooks/usePlayback'
import { useRecording } from './hooks/useRecording'
import { useRecordingStore } from './store/recording'

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
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

  const { playbackUrl, clearPlayback, setPlaybackFromChunks } = usePlayback()
  const {
    captureVideoRef,
    canvasRef,
    countdownValue,
    recordDuration,
    startRecording,
    stopRecording,
    getChunks,
  } = useRecording({ settings, setStatus })

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
    setPlayheadMs(Math.floor(result.duration / 2))
    setSelectedSegmentId(null)
    setHasRecorded(true)
  }, [setPlaybackFromChunks, settings.autoZoom, stopRecording])

  const handleSplit = useCallback(() => {
    if (!hasRecorded || recordDuration === 0) return

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
  }, [hasRecorded, playheadMs, recordDuration])

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
  useHotkeys('delete,backspace', handleDeleteSegment, {
    enabled: !!selectedSegmentId,
    preventDefault: true,
  })

  const handleUpdateSegment = useCallback(
    (id: string, updates: Partial<import('../shared/types').TimelineSegment>) => {
      setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
    },
    [],
  )

  const handleExport = useCallback(async () => {
    if (exportProgress !== null) return

    setExportDone(false)
    setExportError(null)
    setExportProgress(0)

    const chunks = getChunks()
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
            recordDuration={recordDuration}
            settings={settings}
            playbackUrl={playbackUrl}
            captureVideoRef={captureVideoRef}
            canvasRef={canvasRef}
            segments={segments}
            playheadMs={playheadMs}
            onPlayheadChange={setPlayheadMs}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
          />

          <div className="flex items-center justify-center gap-3">
            {status === 'idle' && !hasRecorded ? (
              <button
                data-testid="record-btn"
                className="flex items-center gap-2 rounded-full bg-red-500 px-7 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/25 active:scale-95"
                onClick={handleRecord}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
                Record
              </button>
            ) : status === 'idle' && hasRecorded ? (
              <>
                <button
                  data-testid="play-btn"
                  className="flex items-center gap-2 rounded-full bg-blue-600 px-7 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/25 active:scale-95"
                  onClick={() => setIsPlaying((p) => !p)}
                >
                  {isPlaying ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
                        <rect x="1" y="1" width="3.5" height="10" rx="0.5" />
                        <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
                        <polygon points="2,0 12,6 2,12" />
                      </svg>
                      Play
                    </>
                  )}
                </button>
                <button
                  data-testid="record-btn"
                  className="flex items-center gap-2 rounded-full bg-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 hover:bg-zinc-600 active:scale-95"
                  onClick={handleRecord}
                >
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  Re-record
                </button>
              </>
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
              onClick={() => setSettingsOpen((open) => !open)}
            >
              Settings
            </button>
          </div>

          <div className="mt-5 flex items-center gap-2.5">
            <label htmlFor="zoom-toggle" className="text-xs font-medium text-zinc-400 cursor-pointer">
              Auto-Zoom
            </label>
            <input
              type="checkbox"
              id="zoom-toggle"
              data-testid="zoom-toggle"
              checked={settings.autoZoom}
              onChange={(event) => updateSettings({ autoZoom: event.target.checked })}
              className="h-4 w-4 rounded accent-red-500 cursor-pointer"
            />
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
        recordDuration={recordDuration}
        playheadMs={playheadMs}
        selectedSegmentId={selectedSegmentId}
        segments={segments}
        onSetPlayheadMs={setPlayheadMs}
        onToggleSegmentSelected={(id) =>
          setSelectedSegmentId((prev) => (prev === id ? null : id))
        }
        onSplit={handleSplit}
        onDeleteSegment={handleDeleteSegment}
        onUpdateSegment={handleUpdateSegment}
      />

      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 py-2.5">
        <div className="text-xs text-zinc-600">
          {status === 'recording' ? (
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              {fmtMs(recordDuration)}
            </span>
          ) : exportError ? (
            <span className="text-rose-400">{exportError}</span>
          ) : exportProgress !== null ? (
            <span className="text-blue-400">Exporting… {Math.round(exportProgress * 100)}%</span>
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
