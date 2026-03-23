import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimelineSegment, ZoomEvent } from '../../shared/types'
import { fmtMs } from '../utils/format'

interface TimelineProps {
  hasRecorded: boolean
  recordDuration: number
  playheadMs: number
  selectedSegmentId: string | null
  segments: TimelineSegment[]
  zoomEvents: ZoomEvent[]
  isPlaying: boolean
  autoZoomLevel: number
  dwellZoomLevel: number
  onSetPlayheadMs: (value: number) => void
  onToggleSegmentSelected: (id: string) => void
  onSplit: () => void
  onDeleteSegment: () => void
  onUpdateSegment: (id: string, updates: Partial<TimelineSegment>) => void
  onPlayingChange: (playing: boolean) => void
}

export function Timeline(props: TimelineProps) {
  const {
    hasRecorded,
    recordDuration,
    playheadMs,
    selectedSegmentId,
    segments,
    zoomEvents,
    isPlaying,
    autoZoomLevel,
    dwellZoomLevel,
    onSetPlayheadMs,
    onToggleSegmentSelected,
    onSplit,
    onDeleteSegment,
    onUpdateSegment,
    onPlayingChange,
  } = props

  const [trimDrag, setTrimDrag] = useState<{
    segmentId: string
    side: 'left' | 'right'
  } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const totalDur = Math.max(recordDuration, 1)

  // Collapsed visual layout: position non-deleted segments contiguously
  const visibleSegments = segments
    .filter((s) => !s.deleted)
    .sort((a, b) => a.startTime - b.startTime)

  const visualDuration = Math.max(
    visibleSegments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0),
    1,
  )

  // Map absolute time -> visual fraction (0..1) in collapsed layout
  function absToVisualFrac(absMs: number): number {
    let visualMs = 0
    for (const seg of visibleSegments) {
      if (absMs <= seg.startTime) break
      if (absMs >= seg.endTime) {
        visualMs += seg.endTime - seg.startTime
      } else {
        visualMs += absMs - seg.startTime
        break
      }
    }
    return visualMs / visualDuration
  }

  // Map visual fraction (0..1) -> absolute time
  function visualFracToAbs(frac: number): number {
    let targetMs = frac * visualDuration
    for (const seg of visibleSegments) {
      const segDur = seg.endTime - seg.startTime
      if (targetMs <= segDur) {
        return seg.startTime + targetMs
      }
      targetMs -= segDur
    }
    const last = visibleSegments[visibleSegments.length - 1]
    return last ? last.endTime : 0
  }

  // Trim drag handler
  useEffect(() => {
    if (!trimDrag || !trackRef.current) return
    const track = trackRef.current

    const handleMouseMove = (e: MouseEvent) => {
      const rect = track.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const timeMs = Math.round(visualFracToAbs(frac))

      const seg = segments.find((s) => s.id === trimDrag.segmentId)
      if (!seg) return

      if (trimDrag.side === 'left') {
        const newStart = Math.max(0, Math.min(timeMs, seg.endTime - 100))
        onUpdateSegment(trimDrag.segmentId, { startTime: newStart })
      } else {
        const newEnd = Math.min(totalDur, Math.max(timeMs, seg.startTime + 100))
        onUpdateSegment(trimDrag.segmentId, { endTime: newEnd })
      }
    }

    const handleMouseUp = () => setTrimDrag(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [trimDrag, segments, recordDuration, onUpdateSegment])

  // Smart time ruler ticks
  const ticks = useMemo(() => {
    const dur = visualDuration
    let interval: number
    if (dur <= 15000) interval = 2000
    else if (dur <= 30000) interval = 5000
    else if (dur <= 60000) interval = 10000
    else if (dur <= 300000) interval = 30000
    else interval = 60000

    const major: number[] = []
    for (let t = 0; t <= dur; t += interval) {
      major.push(t)
    }
    if (dur - major[major.length - 1] > interval * 0.3) {
      major.push(dur)
    }
    return { major, interval }
  }, [visualDuration])

  if (!hasRecorded) return null

  const playheadFrac = absToVisualFrac(playheadMs) * 100

  // Hover scrub — move mouse over tracks to preview that frame instantly
  // Only when NOT playing — don't interfere with active playback
  const handleTrackMouseMove = (e: React.MouseEvent) => {
    if (trimDrag) return
    if (isPlaying) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const ms = Math.round(visualFracToAbs(frac))
    onSetPlayheadMs(ms)
  }

  const handleTrackClick = (e: React.MouseEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (isPlaying) onPlayingChange(false)
    onSetPlayheadMs(Math.round(visualFracToAbs(frac)))
  }

  return (
    <div
      data-testid="timeline"
      className="border-t border-zinc-800/60 bg-zinc-900/95 flex-shrink-0"
      style={{ height: '11.5rem' }}
    >
      <div className="px-4 py-2 h-full flex flex-col">
        {/* Header with transport controls */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase">
              Timeline
            </span>
            <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
              {fmtMs(playheadMs)} / {fmtMs(visualDuration)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Transport: skip-back / play-pause / skip-forward */}
            <button
              onClick={() => {
                if (visibleSegments.length > 0) onSetPlayheadMs(visibleSegments[0].startTime)
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Skip to start"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="2" width="1.5" height="8" rx="0.5" />
                <polygon points="11,2 4,6 11,10" />
              </svg>
            </button>
            <button
              onClick={() => onPlayingChange(!isPlaying)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="1.5" width="3" height="9" rx="0.75" />
                  <rect x="7" y="1.5" width="3" height="9" rx="0.75" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <polygon points="2.5,0.5 11,6 2.5,11.5" />
                </svg>
              )}
            </button>
            <button
              onClick={() => {
                if (visibleSegments.length > 0) {
                  const last = visibleSegments[visibleSegments.length - 1]
                  onSetPlayheadMs(last.endTime)
                }
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Skip to end"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <polygon points="1,2 8,6 1,10" />
                <rect x="9.5" y="2" width="1.5" height="8" rx="0.5" />
              </svg>
            </button>

            <div className="w-px h-4 bg-zinc-700/50 mx-1.5" />

            <button
              onClick={onSplit}
              className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-all border border-zinc-700/50"
              title="Split at playhead (S key)"
            >
              <span className="flex items-center gap-1.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <line x1="5" y1="0" x2="5" y2="10" />
                  <line x1="2" y1="3" x2="5" y2="0" />
                  <line x1="8" y1="3" x2="5" y2="0" />
                </svg>
                Split
              </span>
            </button>
            <button
              onClick={onDeleteSegment}
              disabled={!selectedSegmentId}
              className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-all border border-zinc-700/50 disabled:opacity-30 disabled:pointer-events-none"
              title="Delete selected segment (Delete key)"
            >
              Delete
            </button>
            <span className="text-[10px] text-zinc-700 ml-1">S / Del</span>
          </div>
        </div>

        {/* Tracks area — hover to scrub, click to seek */}
        <div
          ref={trackRef}
          className="relative flex-1 flex flex-col gap-1 cursor-pointer"
          onMouseMove={handleTrackMouseMove}
          onClick={handleTrackClick}
        >
          {/* Clip track — orange/amber like Screen Studio */}
          <div
            className="relative flex-1 rounded-md overflow-hidden border border-amber-700/25"
            style={{ background: 'rgba(180, 83, 9, 0.12)' }}
          >
            {(() => {
              let visualOffset = 0
              return visibleSegments.map((segment) => {
                const segDur = segment.endTime - segment.startTime
                const left = (visualOffset / visualDuration) * 100
                const width = Math.max((segDur / visualDuration) * 100, 0.5)
                visualOffset += segDur
                const isSelected = segment.id === selectedSegmentId

                return (
                  <div
                    key={segment.id}
                    className={`absolute inset-y-0 rounded-md transition-colors duration-75 ${
                      isSelected ? 'ring-1 ring-amber-400/60 ring-inset' : ''
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: isSelected
                        ? 'rgba(217, 119, 6, 0.4)'
                        : 'rgba(217, 119, 6, 0.25)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSegmentSelected(segment.id)
                    }}
                  >
                    {/* Clip label inside the block */}
                    <div className="absolute inset-0 flex items-center px-2.5 pointer-events-none overflow-hidden">
                      <span className="text-[10px] font-medium text-amber-200/60 truncate">
                        Clip {fmtMs(segDur)} {segment.speed !== 1 ? `${segment.speed}x` : '1x'}
                      </span>
                    </div>
                    {/* Trim handles */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l-md hover:bg-amber-400/25"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setTrimDrag({ segmentId: segment.id, side: 'left' })
                      }}
                    />
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r-md hover:bg-amber-400/25"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setTrimDrag({ segmentId: segment.id, side: 'right' })
                      }}
                    />
                  </div>
                )
              })
            })()}
          </div>

          {/* Zoom events track — purple/indigo blocks with labels */}
          {zoomEvents.length > 0 && (
            <div
              className="relative rounded-md overflow-hidden border border-violet-500/15"
              style={{ height: '1.75rem', background: 'rgba(39, 39, 42, 0.25)' }}
            >
              {zoomEvents.map((evt, i) => {
                const leftPct = absToVisualFrac(evt.startMs) * 100
                const rightPct = absToVisualFrac(evt.endMs) * 100
                const widthPct = Math.max(rightPct - leftPct, 0.8)
                const isClick = evt.type === 'click'
                const level = isClick ? autoZoomLevel : dwellZoomLevel

                return (
                  <div
                    key={i}
                    className="absolute inset-y-0.5 rounded flex items-center px-1.5 overflow-hidden pointer-events-none"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      background: isClick
                        ? 'rgba(139, 92, 246, 0.4)'
                        : 'rgba(99, 102, 241, 0.3)',
                      borderLeft: `2px solid ${
                        isClick ? 'rgba(167, 139, 250, 0.6)' : 'rgba(129, 140, 248, 0.5)'
                      }`,
                    }}
                  >
                    <span className="text-[9px] font-medium text-violet-300/70 truncate whitespace-nowrap">
                      Zoom {level.toFixed(1)}x {isClick ? 'Click' : 'Auto'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Playhead — blue dot + vertical line spanning all tracks */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{ left: `${playheadFrac}%` }}
          >
            <div
              className="absolute top-0 bottom-0 left-0 w-px"
              style={{ background: 'rgba(59, 130, 246, 0.7)' }}
            />
            <div
              className="absolute -top-1 left-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
              style={{
                background: '#3b82f6',
                boxShadow: '0 0 6px rgba(59, 130, 246, 0.5)',
              }}
            />
          </div>
        </div>

        {/* Time ruler with smart ticks */}
        <div className="relative h-5 mt-1">
          {ticks.major.map((t, i) => {
            const pct = (t / visualDuration) * 100
            return (
              <div
                key={i}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-1.5 bg-zinc-600/80" />
                <span className="text-[9px] text-zinc-500 font-mono tabular-nums leading-tight mt-0.5">
                  {fmtMs(t)}
                </span>
              </div>
            )
          })}
          {/* Minor tick dots between major ticks */}
          {(() => {
            const minorInterval = ticks.interval / 5
            if (minorInterval < 500) return null
            const dots: React.ReactElement[] = []
            for (let t = minorInterval; t < visualDuration; t += minorInterval) {
              if (ticks.major.some((m) => Math.abs(t - m) < minorInterval * 0.4)) continue
              const pct = (t / visualDuration) * 100
              dots.push(
                <div
                  key={`d${t}`}
                  className="absolute top-0.5 w-0.5 h-0.5 rounded-full bg-zinc-700"
                  style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                />,
              )
            }
            return dots
          })()}
        </div>
      </div>
    </div>
  )
}
